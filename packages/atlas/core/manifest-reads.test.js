import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/manifest-reads: a CLI that requires its package.json for the
// version and imports a helper from another part.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/manifest-reads');
const BOUNDARIES = [
  { name: 'src', globs: ['src/**'] },
  { name: 'lib', globs: ['lib/**'] },
  { name: 'root', globs: ['*'] },
];
const roots = [];
let mapped;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an import of a manifest', () => {
  it('draws no edge to the part holding it, and the door does not reach it', () => {
    assert.deepEqual(mapped.edges.map((edge) => `${edge.from}->${edge.to}`), ['src->lib']);
    const mr = mapped.doors.find((door) => door.kind === 'command' && door.name === 'mr');
    assert.deepEqual(mr.reach.map((entry) => entry.boundary), ['src', 'lib']);
  });

  it('is a read of the manifest', () => {
    const manifest = mapped.landings.find((landing) => landing.target === 'package.json');
    assert.deepEqual(manifest?.readers, [{ by: 'src/cli.js', call: 'import', confidence: 'ast' }]);
  });
});
