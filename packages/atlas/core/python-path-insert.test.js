import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/python-path-insert: tests that put a directory on their
// import path, then import from it (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/python-path-insert');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a directory a Python file inserts on sys.path', () => {
  it('is where its bare imports resolve', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'scripts', globs: ['scripts/**'], role: 'code' },
      { name: 'tools', globs: ['tools/**'], role: 'code' },
      { name: 'tests', globs: ['tests/**'], role: 'test' },
      { name: 'root', globs: ['*'], role: 'config' },
    ];
    const mapped = mapRepository({ repoPath: root, boundaries });
    const tests = mapped.boundaries.find((boundary) => boundary.name === 'tests');
    const resolved = (path) => tests.files.find((file) => file.path === path).imports.filter((site) => site.resolved?.outcome === 'file').map((site) => site.resolved.path);
    assert.deepEqual(resolved('tests/test_chain.py'), ['scripts/process_month.py']);
    assert.deepEqual(resolved('tests/test_tools.py'), ['tools/graph_lint.py']);
    assert.equal(tests.unresolvedSites, 0);
  });
});
