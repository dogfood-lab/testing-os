import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/built-tests: node --test handed a glob over a build's
// output, which is not tracked (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/built-tests');
const roots = [];
let mapped;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'src', globs: ['src/**'], role: 'code' }] });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function runs(file) {
  const door = mapped.doors.find((entry) => entry.file === file);
  // A build runs none of what it builds.
  return door.runs.filter((run) => run.runKind !== 'checks' && !run.built).map((run) => run.path).sort();
}

describe('a test run of a build\'s output', () => {
  it('runs the sources the glob\'s built files come from, where node expands it', () => {
    assert.deepEqual(runs('.github/workflows/windows.yml'), ['src/tests/']);
  });

  it('runs what sh selects among the built files on Linux, and keeps what it leaves out', () => {
    assert.deepEqual(runs('.github/workflows/ci.yml'), ['src/tests/unit/sum.test.ts']);
    const door = mapped.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    assert.deepEqual(door.shellMissed, [{ base: 'src/tests/', files: 1, platform: 'linux', tests: true, twoStars: true }]);
  });
});
