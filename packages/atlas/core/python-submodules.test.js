import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/python-submodules: from audiokit import formats loads the
// submodule audiokit/formats.py when __init__.py does not define the name,
// and from . import mix does the same inside the package (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/python-submodules');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function importsOf(path) {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'audiokit', globs: ['audiokit/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }, { name: 'root', globs: ['*'], role: 'config' }] });
  const file = mapped.boundaries.flatMap((boundary) => boundary.files).find((entry) => entry.path === path);
  return [...new Set(file.imports.map((site) => site.resolved?.path ?? site.resolved?.outcome))].sort();
}

describe('an import of a module from its package', () => {
  it('reaches the module file as well as the package', () => {
    assert.deepEqual(importsOf('tests/test_formats.py'), ['audiokit/__init__.py', 'audiokit/formats.py', 'audiokit/render/__init__.py', 'audiokit/render/engine.py']);
  });

  it('does so for a relative import inside the package', () => {
    assert.deepEqual(importsOf('audiokit/core.py'), ['audiokit/__init__.py', 'audiokit/mix.py']);
  });
});
