import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/import-chain: an entry with no order of work whose imports
// are a version __init__.py, a file that goes on, and a leaf (see the
// fixture's README). Slice AC's fallback read the entry's import list in
// order; an arrow is an import of the file before it.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/import-chain');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a path by imports alone', () => {
  it('goes from each file to one it imports, the one that goes on first', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'tool', globs: ['src/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/import-chain' });
    assert.deepEqual(JSON.parse(json).startHere, ['.github/workflows/ci.yml', 'src/tool/cli.py', 'src/tool/gate.py', 'src/tool/scorecard.py']);
  });
});
