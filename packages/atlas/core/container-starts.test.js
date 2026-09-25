import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/container-starts: an image whose CMD starts a build output
// copied in from a build stage, and one whose shell-form ENTRYPOINT starts a
// script from its own WORKDIR.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/container-starts');
const roots = [];
let doors;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  doors = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] }).doors;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function runs(file) {
  return doors.find((door) => door.file === file).runs.map((run) => `${run.path} ${run.runKind}${run.built ? ' built' : ''}`);
}

describe('what an image starts', () => {
  it('runs the source of the build output a CMD starts, through the stage it was copied from', () => {
    assert.deepEqual(runs('.github/workflows/image.yml'), [
      'package.json checks',
      'packages/ checks',
      // The image's tsc emits to an outDir: a build.
      'packages/node/ executes built',
      'packages/node/src/main.ts executes',
      'pnpm-workspace.yaml checks',
    ]);
  });

  it('runs the script a shell-form ENTRYPOINT starts, from the WORKDIR the script was copied into', () => {
    assert.deepEqual(runs('.github/workflows/worker.yml'), ['worker/run.py executes']);
  });

  it('starts the command a manifest copied into the image installs, not one of the same name it left out', () => {
    assert.deepEqual(runs('.github/workflows/cli.yml'), ['camp/ checks', 'camp/cli.py executes', 'pyproject.toml checks']);
  });
});
