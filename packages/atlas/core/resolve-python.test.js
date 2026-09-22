import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { PYTHON_FLAT, PYTHON_SRC, makeRepo } from './fixture-repo.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function sites(result, path) {
  const files = [...result.boundaries.flatMap((boundary) => boundary.files), ...result.unassigned];
  const file = files.find((entry) => entry.path === path);
  assert.ok(file, path);
  return Object.fromEntries(file.imports.map((site) => [`${site.kind}:${site.specifier}`, site.resolved]));
}

describe('python resolution', () => {
  it('resolves a src layout, relative imports, the standard library, and a name that is present but not a module', () => {
    const root = makeRepo(PYTHON_SRC);
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    const caller = sites(result, 'src/app/caller.py');
    assert.deepEqual(caller['static:app.models'], { outcome: 'file', path: 'src/app/models.py' });
    assert.deepEqual(caller['static:.models'], { outcome: 'file', path: 'src/app/models.py' });
    assert.deepEqual(caller['static:..app.models'], { outcome: 'file', path: 'src/app/models.py' });
    assert.deepEqual(caller['static:os'], { outcome: 'external' });
    assert.deepEqual(caller['static:nowhere_module_xyz'], { outcome: 'external' });
    assert.deepEqual(caller['static:present_name.missing'], {
      outcome: 'unresolved',
      reason: 'python-module-not-found',
    });
  });

  it('resolves a flat layout from the git root, including one-dot and two-dot relatives', () => {
    const root = makeRepo(PYTHON_FLAT);
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    assert.deepEqual(sites(result, 'main.py')['static:pkg.models'], { outcome: 'file', path: 'pkg/models.py' });
    const child = sites(result, 'pkg/sub/child.py');
    assert.deepEqual(child['static:.helper'], { outcome: 'file', path: 'pkg/sub/helper.py' });
    assert.deepEqual(child['static:..models'], { outcome: 'file', path: 'pkg/models.py' });
  });
});
