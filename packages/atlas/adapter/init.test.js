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
    assert.match(result.stdout, /proposed 4 boundaries from workspace packages and top-level directories/);
    assert.match(result.stdout, /README\.md/);
    const doc = readBoundaryFile(root);
    assert.equal(doc.ok, true, doc.details?.join('\n'));
    assert.equal(doc.summary, '');
    assert.deepEqual(doc.boundaries.map((boundary) => boundary.name), ['alpha', 'beta', 'scripts', 'shared']);
    assert.deepEqual(
      doc.boundaries.map((boundary) => boundary.globs),
      [['packages/alpha/**'], ['packages/beta/**'], ['scripts/**'], ['shared/**']],
    );
    assert.ok(doc.boundaries.every((boundary) => boundary.status === 'proposed'));
    assert.ok(doc.boundaries.every((boundary) => boundary.why_from === 'derived' && boundary.will_break_from === 'derived'));
    assert.ok(doc.boundaries.every((boundary) => boundary.start_here == null));
    const beta = doc.boundaries.find((boundary) => boundary.name === 'beta');
    assert.equal(beta.role, 'code');
    assert.match(beta.reason, /role code/);
    assert.equal(existsStructure(root), false);
  });

  it('proposes one boundary per top-level directory when there is no manifest', () => {
    const root = scratch();
    cpSync(FLAT, root, { recursive: true });
    commitTree(root);
    const result = atlas(root, ['init']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /from top-level directories/);
    assert.match(result.stdout, /README\.md/);
    const doc = readBoundaryFile(root);
    assert.equal(doc.ok, true, doc.details?.join('\n'));
    assert.equal(doc.summary, '');
    const byName = new Map(doc.boundaries.map((boundary) => [boundary.name, boundary]));
    assert.deepEqual([...byName.keys()].sort(), ['docs', 'src', 'tests']);
    assert.equal(byName.get('docs').role, 'docs');
    assert.equal(byName.get('tests').role, 'test');
    assert.equal(byName.get('src').role, 'code');
    assert.ok(doc.boundaries.every((boundary) => boundary.start_here == null));
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
    const text = readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8');
    const accepted = text.replace('status: proposed', 'status: accepted');
    writeFileSync(join(root, 'atlas', 'boundaries.yaml'), accepted);
    const kept = atlas(root, ['init', '--force']);
    assert.equal(kept.status, 2);
    assert.match(kept.stdout, /ATLAS_INIT_WOULD_OVERWRITE/);
    writeFileSync(join(root, 'atlas', 'boundaries.yaml'), text.replace('why_from: derived', 'why_from: human'));
    const human = atlas(root, ['init', '--force']);
    assert.equal(human.status, 2);
    assert.match(human.stdout, /ATLAS_INIT_WOULD_OVERWRITE/);
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
    assert.deepEqual(doc.boundaries.map((boundary) => boundary.name), ['app', 'docs', 'fixtures']);
    assert.equal(doc.boundaries.find((boundary) => boundary.name === 'app').role, 'code');
    assert.equal(doc.boundaries.find((boundary) => boundary.name === 'docs').role, 'docs');
    assert.match(result.stdout, /README\.md/);
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
