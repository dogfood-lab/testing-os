import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/turbo-runs: the root's scripts hand turbo a task, which runs
// in every member that defines it (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/turbo-runs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('turbo run', () => {
  it('runs the task in every workspace member that defines it', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const { doors } = mapRepository({ repoPath: root, boundaries: [{ name: 'packages', globs: ['packages/**'], role: 'code' }] });
    const ci = doors.find((door) => door.file === '.github/workflows/ci.yml');
    const runs = ci.runs.filter((run) => run.runKind !== 'checks').map((run) => run.path).sort();
    assert.deepEqual(runs, ['packages/core/scripts/build.mjs', 'packages/core/test/', 'packages/ui/src/build.mjs']);
    assert.ok(ci.runs.every((run) => /turbo run (build|test)/.test(run.via ?? '')), JSON.stringify(ci.runs));
  });
});
