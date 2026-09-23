import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/python-data: a package that finds its bundled data through
// pathlib and hands the path back rather than opening it where it is built.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/python-data');
const roots = [];
let mapped;

function file(path) {
  const found = mapped.boundaries.flatMap((boundary) => boundary.files).find((item) => item.path === path);
  assert.ok(found, path);
  return found;
}

function targets(path) {
  return file(path).reads.map((read) => read.target);
}

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = parse(readFileSync(join(FIXTURE, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries;
  mapped = mapRepository({ repoPath: root, boundaries });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('pathlib paths built from __file__', () => {
  it('reads the directory a / join beside the module names', () => {
    assert.ok(targets('src/stress/patterns/library.py').includes('src/stress/patterns/data'), JSON.stringify(file('src/stress/patterns/library.py').reads));
  });

  it('follows with_name and joinpath from a resolved anchor', () => {
    assert.ok(targets('src/stress/patterns/library.py').includes('src/stress/patterns/data/manifest.json'), JSON.stringify(file('src/stress/patterns/library.py').reads));
  });

  it('follows resolve() and a .parent chain back down to a file', () => {
    assert.deepEqual(targets('src/stress/chains/loader.py'), ['src/stress/patterns/data/chains.yaml']);
  });

  it('never reads the module itself for the Path(__file__) a join starts from', () => {
    assert.ok(!targets('src/stress/patterns/library.py').includes('src/stress/patterns/library.py'));
    assert.ok(!targets('src/stress/chains/loader.py').includes('src/stress/chains/loader.py'));
  });
});
