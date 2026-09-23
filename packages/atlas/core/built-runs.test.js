import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/built-runs: CI builds src/ into an ignored dist/ and runs the
// built CLI, once handed to node and once as the command itself.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/built-runs');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a run of a build output', () => {
  it('runs the source the tracked config builds it from', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const { doors } = mapRepository({ repoPath: root, boundaries: [{ name: 'src', globs: ['src/**'] }] });
    const ci = doors.find((door) => door.file === '.github/workflows/ci.yml');
    const runs = ci.runs.map((run) => `${run.path} ${run.runKind}`);
    // npm run build hands tsc the sources, which checks them and runs none.
    assert.deepEqual(runs, ['src/ checks', 'src/cli.ts executes']);
    assert.deepEqual(ci.reach.map((entry) => `${entry.boundary}:${entry.files}`), ['src:2']);
  });
});
