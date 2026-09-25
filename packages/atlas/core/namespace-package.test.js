import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/namespace-package: from pipeline import ingest, where
// pipeline/ has no __init__.py (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/namespace-package');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an import from a namespace package', () => {
  it('resolves to the module it names inside it', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'pipeline', globs: ['pipeline/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }, { name: 'root', globs: ['*'], role: 'config' }] });
    const test = mapped.boundaries.find((boundary) => boundary.name === 'tests').files[0];
    assert.deepEqual(test.imports.map((site) => site.resolved?.path ?? site.resolved?.outcome), ['pipeline/ingest.py']);
  });
});
