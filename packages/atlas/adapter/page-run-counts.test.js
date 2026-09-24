import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/run-counts: a door that runs four test files and a
// directory of five more (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/run-counts');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('how many files a door runs', () => {
  it('counts the files a directory run stands for in "and N more"', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'tests', globs: ['tests/**'], role: 'code' }] }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/run-counts' });
    assert.match(markdown, /1\. \*\*CI\.\*\* On a pull request\. Runs tests\/a\.test\.js, tests\/b\.test\.js, tests\/c\.test\.js and 6 more\./);
    assert.match(markdown, /The workflow runs 9 files in tests\./);
    const door = JSON.parse(json).doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    assert.equal(door.runsMore, 6);
  });
});
