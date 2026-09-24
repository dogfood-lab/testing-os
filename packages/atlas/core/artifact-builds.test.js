import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/artifact-builds: a container image built two ways, a wheel
// and a binary, each from files this repository tracks.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/artifact-builds');
const roots = [];
let doors;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  doors = mapRepository({ repoPath: root, boundaries: [] }).doors;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function runs(file) {
  return doors.find((door) => door.file === file).runs.map((run) => `${run.path} ${run.runKind}`);
}

const IMAGE = ['docker-entrypoint.sh executes', 'package.json checks', 'scripts/build.mjs executes', 'src/ checks'];

describe('a build of an artifact', () => {
  it('reads a Dockerfile a docker build names: what it copies, what it runs, and what the image starts', () => {
    assert.deepEqual(runs('.github/workflows/container.yml'), IMAGE);
  });

  it('reads the same Dockerfile through build-push-action, and still sends the image', () => {
    assert.deepEqual(runs('.github/workflows/image.yml'), IMAGE);
    assert.deepEqual(doors.find((door) => door.file === '.github/workflows/image.yml').sends.publishesTo, ['container image']);
  });

  it('packs the package pyproject.toml names into a wheel', () => {
    assert.deepEqual(runs('.github/workflows/wheel.yml'), ['camp/ checks']);
  });

  it('bundles the entry pyinstaller is handed, through the env the workflow sets', () => {
    assert.deepEqual(runs('.github/workflows/binary.yml'), ['camp/__main__.py executes']);
  });
});
