import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unresolved-once: one missing module a file imports twice
// (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unresolved-once');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an unresolved import made twice', () => {
  it('is one clause, said with how many sites it is', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'app', globs: ['app/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'config' }] }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unresolved-once' });
    assert.ok(markdown.includes('- 2 imports could not be resolved: `app/encounter.py` imports `app.content.weapons`, which is no module on its import path and no declared dependency, twice.'), markdown);
  });
});
