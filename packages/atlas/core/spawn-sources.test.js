import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/spawn-ts-source: a TypeScript test spawns ../cli.js beside
// it, which is src/cli.ts in source; fixtures/atlas/spawn-mcp-transport: a
// test starts its MCP server through the SDK's stdio transport (see each
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/spawn-ts-source');
const roots = [];

function testFile(fixture, path) {
  const root = makeRepo(resolve(import.meta.dirname, '../../../fixtures/atlas', fixture));
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'bin', globs: ['bin/**'], role: 'code' }, { name: 'test', globs: ['test/**', 'tests/**'], role: 'test' }, { name: 'root', globs: ['*'], role: 'config' }] });
  return mapped.boundaries.flatMap((boundary) => boundary.files).find((file) => file.path === path);
}

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a spawn of a .js path whose TypeScript source is tracked', () => {
  it('runs the source', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'config' }] });
    const test = mapped.boundaries.find((boundary) => boundary.name === 'src').files.find((file) => file.path === 'src/tests/cli.test.ts');
    assert.deepEqual(test.spawns, ['src/cli.ts']);
  });
});

describe('a test that starts an MCP server over stdio', () => {
  it('runs the server the transport is handed', () => {
    assert.deepEqual(testFile('spawn-mcp-transport', 'test/server.test.ts').spawns, ['src/server.ts']);
  });
});

// fixtures/atlas/spawn-shapes: four more ways a test starts what it tests.
describe('the ways a test starts the program it tests', () => {
  it('reads execFile made a promise as execFile (registry-stats)', () => {
    assert.deepEqual(testFile('spawn-shapes', 'test/promisify.test.ts').spawns, ['bin/one.js']);
  });

  it('reads past a flag whose value is computed at run time (si-rpg-engine)', () => {
    assert.deepEqual(testFile('spawn-shapes', 'test/flag.test.js').spawns, ['bin/two.js']);
  });

  it('follows a helper that hands spawn its program and arguments (vocal-synth-engine)', () => {
    assert.deepEqual(testFile('spawn-shapes', 'test/helper.test.ts').spawns, ['bin/three.js']);
  });

  it('reads the binary Cargo hands an integration test (saints-mile)', () => {
    const version = testFile('spawn-shapes', 'tests/version.rs');
    assert.deepEqual(version.spawns, ['src/main.rs']);
    assert.deepEqual(version.spawnsInstalled, ['src/main.rs']);
  });
});
