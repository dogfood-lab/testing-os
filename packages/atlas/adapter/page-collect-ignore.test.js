import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/collect-ignore: scripts a conftest keeps out of pytest's
// collection (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/collect-ignore');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a script conftest.py keeps out of collection', () => {
  it('is no test file a workflow should run', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'pipeline', globs: ['pipeline/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/collect-ignore' });
    assert.ok(markdown.includes('tests/test_unrun.py runs in no workflow.'), markdown);
    assert.ok(!markdown.includes('pipeline/test_'), markdown);
  });
});
