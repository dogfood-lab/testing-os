import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readBoundaryFile } from './boundary-file.js';
import { leafDirs, nameProposals } from './propose.js';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const BASIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/basic');
const FLAT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/flat');
const ROLES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/roles');
const ROOT_MANIFEST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/root-manifest');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function scratch() {
  const path = mkdtempSync(join(tmpdir(), 'atlas-init-'));
  roots.push(path);
  return path;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function commitTree(root) {
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'fixture']);
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe('atlas init', () => {
  it('proposes one boundary per package in the basic fixture', () => {
    const root = scratch();
    cpSync(BASIC, root, { recursive: true });
    writeJson(join(root, 'package.json'), { name: 'basic', workspaces: ['packages/*'] });
    writeJson(join(root, 'packages', 'alpha', 'package.json'), { name: '@dogfood-lab/alpha', main: './index.js' });
    writeJson(join(root, 'packages', 'beta', 'package.json'), { name: '@dogfood-lab/beta', main: './index.js' });
    writeFileSync(join(root, 'packages', 'beta', 'extra.test.js'), 'export const extra = 1;\n');
    writeFileSync(join(root, 'packages', 'beta', 'more.test.js'), 'export const more = 1;\n');
    commitTree(root);
    const result = atlas(root, ['init']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /proposed 5 boundaries from workspace packages and top-level directories/);
    const doc = readBoundaryFile(root);
    assert.equal(doc.ok, true, doc.details?.join('\n'));
    assert.equal(doc.summary, '');
    assert.deepEqual(doc.boundaries.map((boundary) => boundary.name), ['alpha', 'beta', 'root', 'scripts', 'shared']);
    assert.deepEqual(
      doc.boundaries.map((boundary) => boundary.globs),
      [['packages/alpha/**'], ['packages/beta/**'], ['*'], ['scripts/**'], ['shared/**']],
    );
    assert.deepEqual(doc.ignored, []);
    for (const boundary of doc.boundaries) assert.deepEqual(Object.keys(boundary).sort(), ['globs', 'name', 'role']);
    const text = readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8');
    assert.doesNotMatch(text, /status|reason|why_from|will_break|start_here|machine_budget/);
    assert.equal(doc.boundaries.find((boundary) => boundary.name === 'beta').role, 'code');
    assert.doesNotMatch(result.stdout, /reason|status/);
    assert.equal(existsStructure(root), false);
  });

  it('proposes one boundary per top-level directory when there is no manifest', () => {
    const root = scratch();
    cpSync(FLAT, root, { recursive: true });
    commitTree(root);
    const result = atlas(root, ['init']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /from top-level directories/);
    const doc = readBoundaryFile(root);
    assert.equal(doc.ok, true, doc.details?.join('\n'));
    assert.equal(doc.summary, '');
    const byName = new Map(doc.boundaries.map((boundary) => [boundary.name, boundary]));
    assert.deepEqual([...byName.keys()].sort(), ['docs', 'root', 'src', 'tests']);
    assert.deepEqual(byName.get('root').globs, ['*']);
    assert.equal(byName.get('docs').role, 'docs');
    assert.equal(byName.get('tests').role, 'test');
    assert.equal(byName.get('src').role, 'code');
  });

  it('gives a workflow directory config, directories of data data, and leaves a docs directory as docs', () => {
    const root = scratch();
    cpSync(ROLES, root, { recursive: true });
    commitTree(root);
    const result = atlas(root, ['init']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const doc = readBoundaryFile(root);
    const role = Object.fromEntries(doc.boundaries.map((boundary) => [boundary.name, boundary.role]));
    assert.equal(role['.github'], 'config');
    assert.equal(role.assets, 'data');
    assert.equal(role.indexes, 'data');
    assert.equal(role.records, 'data');
    assert.equal(role.reports, 'data');
    assert.equal(role.swarms, 'docs');
  });

  it('calls the part that holds the repository manifest config, though its READMEs outnumber everything else', () => {
    // The root holds package.json, a Dockerfile, verify.sh and eight READMEs.
    // site/ holds a package.json too, but it is the site's, not the
    // repository's; its Astro config makes it the site.
    const root = scratch();
    cpSync(ROOT_MANIFEST, root, { recursive: true });
    commitTree(root);
    const result = atlas(root, ['init']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const role = Object.fromEntries(readBoundaryFile(root).boundaries.map((boundary) => [boundary.name, boundary.role]));
    assert.equal(role.root, 'config');
    assert.equal(role.site, 'site');
    assert.equal(role.src, 'code');
    // A boundary file that leaves the role out gets the same one from map.
    writeFileSync(join(root, 'atlas', 'boundaries.yaml'), [
      'boundaries:',
      '  - name: root',
      '    globs: ["*"]',
      '  - name: site',
      '    globs: ["site/**"]',
      '  - name: src',
      '    globs: ["src/**"]',
      '',
    ].join('\n'));
    const mapped = atlas(root, ['map']);
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    const derived = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8')).boundaries;
    assert.deepEqual(derived.map((boundary) => [boundary.name, boundary.role]), [['root', 'config'], ['site', 'site'], ['src', 'code']]);
  });

  it('refuses to overwrite a file a person has touched, and regenerates one that is still derived', () => {
    const root = scratch();
    cpSync(FLAT, root, { recursive: true });
    commitTree(root);
    assert.equal(atlas(root, ['init']).status, 0);
    const again = atlas(root, ['init']);
    assert.equal(again.status, 2);
    assert.match(again.stdout, /ATLAS_INIT_WOULD_OVERWRITE/);
    const forced = atlas(root, ['init', '--force']);
    assert.equal(forced.status, 0, forced.stdout + forced.stderr);
    const path = join(root, 'atlas', 'boundaries.yaml');
    const text = readFileSync(path, 'utf8');
    writeFileSync(path, text.replace('summary: ""', 'summary: a flat tree of docs, source and tests'));
    const summarised = atlas(root, ['init', '--force']);
    assert.equal(summarised.status, 2);
    assert.match(summarised.stdout, /ATLAS_INIT_WOULD_OVERWRITE/);
    writeFileSync(path, text.replace('    role: docs\n', '    role: docs\n    status: accepted\n'));
    const accepted = atlas(root, ['init', '--force']);
    assert.equal(accepted.status, 2);
    assert.match(accepted.stdout, /ATLAS_INIT_WOULD_OVERWRITE/);
    writeFileSync(path, text.replace('    role: docs\n', '    role: docs\n    status: proposed\n    why_from: derived\n'));
    const derived = atlas(root, ['init', '--force']);
    assert.equal(derived.status, 0, derived.stdout);
    assert.equal(readFileSync(path, 'utf8'), text);
  });

  it('proposes workspace members and leaves a manifest outside those globs in a directory boundary', () => {
    const root = scratch();
    writeJson(join(root, 'package.json'), { name: 'host', workspaces: ['packages/*'] });
    writeJson(join(root, 'packages', 'app', 'package.json'), { name: 'app', main: './index.js' });
    writeFileSync(join(root, 'packages', 'app', 'index.js'), 'export const app = 1;\n');
    writeFileSync(join(root, 'packages', 'app', 'a.test.js'), 'export const a = 1;\n');
    writeFileSync(join(root, 'packages', 'app', 'b.test.js'), 'export const b = 1;\n');
    writeJson(join(root, 'fixtures', 'demo', 'package.json'), { name: 'demo', main: './index.js' });
    writeFileSync(join(root, 'fixtures', 'demo', 'index.js'), 'export const demo = 1;\n');
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'guide.md'), '# Guide\n');
    writeFileSync(join(root, 'README.md'), '# Host\n');
    commitTree(root);
    const result = atlas(root, ['init']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const doc = readBoundaryFile(root);
    assert.equal(doc.ok, true, doc.details?.join('\n'));
    assert.deepEqual(doc.boundaries.map((boundary) => boundary.name), ['app', 'docs', 'fixtures', 'root']);
    assert.equal(doc.boundaries.find((boundary) => boundary.name === 'app').role, 'code');
    assert.equal(doc.boundaries.find((boundary) => boundary.name === 'docs').role, 'docs');
    assert.equal(doc.boundaries.find((boundary) => boundary.name === 'root').globs[0], '*');
  });

  it('does not propose a manifest that contains another manifest', () => {
    assert.deepEqual(leafDirs(['fixtures/atlas/build-output', 'fixtures/atlas/build-output/bundle', 'packages/atlas', '']), [
      'fixtures/atlas/build-output/bundle',
      'packages/atlas',
    ]);
  });

  it('disambiguates two manifests that share a basename with the parent directory', () => {
    assert.deepEqual(
      nameProposals(['packages/lib', 'vendor/lib']).map((proposal) => proposal.name),
      ['packages/lib', 'vendor/lib'],
    );
  });
});

function existsStructure(root) {
  try {
    readFileSync(join(root, 'atlas', 'structure.json'));
    return true;
  } catch {
    return false;
  }
}
