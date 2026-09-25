import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/file-url-import: import() of a file: URL built from a
// repository path (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/file-url-import');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an import of a file: URL made from a path', () => {
  it('imports the file the path names, and reads nothing', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'test', globs: ['test/**'], role: 'code' }, { name: 'tools', globs: ['tools/**'], role: 'code' }] });
    const file = mapped.boundaries.find((boundary) => boundary.name === 'test').files.find((entry) => entry.path === 'test/check.mjs');
    assert.deepEqual(file.imports.filter((site) => site.kind === 'dynamic-literal').map((site) => site.resolved?.path), ['tools/diagnosis/sim.mjs']);
    assert.ok(mapped.edges.some((edge) => edge.from === 'test' && edge.to === 'tools'), JSON.stringify(mapped.edges));
    assert.deepEqual(mapped.landings.filter((landing) => landing.target.startsWith('tools/')), []);
  });
});
