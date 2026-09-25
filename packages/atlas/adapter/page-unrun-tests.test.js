import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unrun-tests: a test file no workflow runs (see README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unrun-tests');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a test file no workflow runs', () => {
  it('is named under what no test touches', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'test', globs: ['test/**'], role: 'test' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unrun-tests' });
    assert.deepEqual(JSON.parse(json).untestedNote, ['test/version.test.js runs in no workflow.']);
  });
});
