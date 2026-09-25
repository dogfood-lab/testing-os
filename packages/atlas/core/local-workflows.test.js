import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/local-workflows: a release that calls this repository's
// CI and a composite action it ships (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/local-workflows');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('local reusable workflows and composite actions', () => {
  it('runs what the called workflow and the action\'s steps run', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }, { name: 'src', globs: ['src/**'], role: 'code' }];
    const { doors } = mapRepository({ repoPath: root, boundaries });
    const release = doors.find((door) => door.file === '.github/workflows/release.yml');
    assert.deepEqual(release.runs.map((run) => run.path).sort(), ['scripts/check.mjs', 'scripts/pack.mjs']);
    assert.deepEqual(release.reach.map((entry) => entry.boundary).sort(), ['scripts', 'src']);
  });
});
