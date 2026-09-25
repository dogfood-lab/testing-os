import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/more-counts: five unrun tests and five files in no part
// (see the fixture's README). Slice AC's unrun-test and unassigned-file
// lines counted the rest as "mores"; this pins both.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/more-counts');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what a list of three leaves out', () => {
  it('is "and N more", in the unrun tests and in the files no part holds', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'tool', globs: ['tool/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/more-counts' });
    assert.ok(markdown.includes('5 test files run in no workflow: tests/test_1.py, tests/test_2.py, tests/test_3.py and 2 more.'), markdown);
    assert.ok(markdown.includes('5 files belong to no part: loose/note1.txt, loose/note2.txt, loose/note3.txt and 2 more.'), markdown);
    assert.ok(!markdown.includes('mores'), markdown);
  });
});
