import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/spawn-helpers: a release gate that runs its stages through
// a helper of its own and one from another file.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/spawn-helpers');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function map() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  return mapRepository({ repoPath: root, boundaries: [{ name: 'scripts', globs: ['scripts/**'] }] });
}

describe('a command handed to a helper that runs it', () => {
  it('is followed one level, a same-file helper and another file\'s alike', () => {
    const gate = map().doors.find((door) => door.file === '.github/workflows/release.yml');
    assert.deepEqual(gate.runs.map((run) => run.path), [
      'scripts/direct.mjs',
      'scripts/docs.mjs',
      'scripts/gate.mjs',
      'scripts/lint.mjs',
      'scripts/smoke.mjs',
      'test/',
    ]);
  });

  it('counts only the command it cannot read as built at run time', () => {
    const files = map().boundaries.find((boundary) => boundary.name === 'scripts').files;
    const built = Object.fromEntries(files.filter((file) => file.dynamicSpawns).map((file) => [file.path, file.dynamicSpawns]));
    assert.deepEqual(built, { 'scripts/gate.mjs': 1 });
  });
});
