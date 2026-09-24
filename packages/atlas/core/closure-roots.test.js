import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/closure-roots: writes made through a closure whose root is
// a variable of the enclosing function (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/closure-roots');
const BOUNDARIES = [
  { name: 'assets', globs: ['assets/**'], role: 'data' },
  { name: 'out', globs: ['out/**'], role: 'data' },
  { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  { name: 'src', globs: ['src/**'], role: 'code' },
];
const roots = [];
let mapped;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function file(path) {
  return mapped.boundaries.flatMap((boundary) => boundary.files).find((entry) => entry.path === path);
}

function writers(target) {
  return (mapped.landings.find((landing) => landing.target === target)?.writers ?? []).map((entry) => entry.by);
}

describe('a write made through a closure', () => {
  it('under a root read from the command line is the caller\'s, in the function and through the closure', () => {
    assert.deepEqual(writers('assets'), []);
    assert.deepEqual(writers('assets/default.f32'), []);
    assert.equal(file('src/pack.js').outsideWrites, 3);
    assert.equal(file('src/pack.js').dynamicWrites ?? 0, 0);
  });

  it('under a parameter its callers hand the command line is the caller\'s through the closure', () => {
    assert.equal(file('src/export.js').outsideWrites, 1);
    assert.equal(file('src/export.js').dynamicWrites ?? 0, 0);
  });

  it('under the file\'s own location lands where the calls to the closure say', () => {
    assert.deepEqual(writers('out/stamp.txt'), ['src/stamp.js']);
    const door = mapped.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    assert.deepEqual(door.landings, ['out/stamp.txt']);
  });
});
