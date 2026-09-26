import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/spawn-ts-source: a TypeScript test spawns ../cli.js beside
// it, which is src/cli.ts in source (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/spawn-ts-source');
const roots = [];

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
