import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';

// fixtures/atlas/pnpm-workspace: members declared only in pnpm-workspace.yaml,
// one loading its source through main and one through a main under dist/.
// The same commit is mapped clean, after an install and after a build, and
// the map must not move: node_modules and dist/ are one machine's disk.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/pnpm-workspace');
const BOUNDARIES = [
  { name: 'desktop', globs: ['apps/desktop/**'] },
  { name: 'domain', globs: ['packages/domain/**'] },
  { name: 'ignored', globs: ['packages/ignored/**'] },
  { name: 'root', globs: ['*'] },
  { name: 'state', globs: ['packages/state/**'] },
];
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function link(root, path, target) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  symlinkSync(join(root, target), join(root, path), 'junction');
}

// What pnpm install leaves: each member linked under the node_modules of the
// packages that depend on it, a dependency in the store, and a package no
// manifest declares that is on disk only because something else pulled it in.
function install(root) {
  link(root, 'apps/desktop/node_modules/@ws/state', 'packages/state');
  link(root, 'apps/desktop/node_modules/@ws/ignored', 'packages/ignored');
  link(root, 'packages/state/node_modules/@ws/domain', 'packages/domain');
  link(root, 'node_modules/@ws/domain', 'packages/domain');
  write(root, 'node_modules/.pnpm/react@18.3.1/node_modules/react/package.json', '{"name":"react","main":"index.js"}\n');
  write(root, 'node_modules/.pnpm/react@18.3.1/node_modules/react/index.js', 'module.exports = {};\n');
  link(root, 'apps/desktop/node_modules/react', 'node_modules/.pnpm/react@18.3.1/node_modules/react');
  write(root, 'node_modules/left-pad/package.json', '{"name":"left-pad","main":"index.js"}\n');
  write(root, 'node_modules/left-pad/index.js', 'module.exports = () => "";\n');
}

function build(root) {
  write(root, 'packages/state/dist/index.js', 'export function store(name) { return name; }\n');
}

function sites(result, path) {
  const file = result.boundaries.flatMap((boundary) => boundary.files).find((entry) => entry.path === path);
  return Object.fromEntries(file.imports.map((site) => [site.specifier, site.resolved]));
}

describe('workspace members declared in pnpm-workspace.yaml', () => {
  it('resolves each member through its main on a clean clone, and counts an import that resolves to nothing', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
    const main = sites(result, 'apps/desktop/src/main.ts');
    assert.deepEqual(main['@ws/state'], { outcome: 'file', path: 'packages/state/src/index.ts' });
    assert.deepEqual(main['@ws/domain'], { outcome: 'file', path: 'packages/domain/src/index.ts' });
    assert.deepEqual(main.react, { outcome: 'external' });
    assert.deepEqual(main['astro:content'], { outcome: 'external' });
    assert.deepEqual(main['left-pad'], { outcome: 'unresolved', reason: 'undeclared-package' });
    assert.deepEqual(main['@ws/ignored'], { outcome: 'unresolved', reason: 'workspace-member-not-found' });
    assert.deepEqual(sites(result, 'packages/state/src/index.ts')['@ws/domain'], { outcome: 'file', path: 'packages/domain/src/index.ts' });
    assert.deepEqual(result.edges.map((edge) => `${edge.from}->${edge.to}`), ['desktop->domain', 'desktop->state', 'state->domain']);
    assert.equal(result.boundaries.find((boundary) => boundary.name === 'desktop').unresolvedSites, 2);
  });

  // Each state is mapped by its own process, the way atlas map runs.
  it('writes the same structure clean, installed and built, and checks green in each', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const cli = (verb) => spawnSync(process.execPath, [CLI, verb], { cwd: root, encoding: 'utf8' });
    const structure = () => {
      assert.equal(cli('map').status, 0);
      return readFileSync(join(root, 'atlas', 'structure.json'), 'utf8');
    };
    const git = (args) => assert.equal(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).status, 0, args.join(' '));
    const clean = structure();
    git(['add', '--', 'atlas']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'map']);
    install(root);
    const installedCheck = cli('check');
    const installed = structure();
    build(root);
    const builtCheck = cli('check');
    const built = structure();
    const settle = (text) => text.replace(/"commit": "[0-9a-f]+"/, '"commit": ""');
    assert.match(clean, /"from": "desktop",\s+"kind": "file",\s+"to": "state"/);
    assert.equal(settle(installed), settle(clean));
    assert.equal(settle(built), settle(clean));
    assert.equal(installedCheck.status, 0, installedCheck.stdout);
    assert.equal(builtCheck.status, 0, builtCheck.stdout);
  });
});
