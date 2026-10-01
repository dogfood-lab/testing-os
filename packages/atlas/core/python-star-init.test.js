import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/python-star-init: package __init__.py files that hand on
// their siblings by relative star-imports (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/python-star-init');
const roots = [];
let byPath;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const result = mapRepository({
    repoPath: root,
    boundaries: [
      { name: 'app', globs: ['app/**'], role: 'code' },
      { name: 'root', globs: ['*'], role: 'code' },
      { name: 'tests', globs: ['tests/**'], role: 'test' },
    ],
  });
  byPath = new Map(result.boundaries.flatMap((boundary) => boundary.files).map((file) => [file.path, file]));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function resolved(path) {
  return byPath.get(path).imports.map((site) => [site.specifier, site.resolved.outcome === 'file' ? site.resolved.path : site.resolved.reason ?? site.resolved.outcome]);
}

describe('a relative star-import in a package __init__.py', () => {
  it('resolves to the sibling module, as a relative from-import does', () => {
    assert.deepEqual(resolved('app/__init__.py'), [['.engine', 'app/engine.py'], ['.', 'app/__init__.py'], ['.clock', 'app/clock.py']]);
    assert.deepEqual(resolved('tests/suite/__init__.py'), [['.test_engine', 'tests/suite/test_engine.py'], ['.test_clock', 'tests/suite/test_clock.py']]);
  });
});
