import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unittest-discover: a gate script that cds to its own
// directory and runs unittest (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unittest-discover');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('python -m unittest in a gate script', () => {
  it('runs the tests it discovers and the case it names', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'tool', globs: ['tool/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.runs.map((run) => run.path), ['tests/', 'verify.sh']);
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unittest-discover' });
    assert.ok(!markdown.includes('run in no workflow'), markdown);
  });
});
