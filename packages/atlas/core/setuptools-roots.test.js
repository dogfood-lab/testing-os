import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/setuptools-roots: source roots setuptools names, and a
// stub beside a test (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/setuptools-roots');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('setuptools source roots', () => {
  it('resolves packages under package-dir and packages.find, and a stub beside a test', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'lib', globs: ['lib/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }, { name: 'tools', globs: ['tools/**'], role: 'code' }];
    const mapped = mapRepository({ repoPath: root, boundaries });
    for (const boundary of mapped.boundaries) assert.equal(boundary.unresolvedSites, 0, boundary.name);
    // from core import gates is read as an import of the package core.
    const cli = mapped.boundaries.find((boundary) => boundary.name === 'tools').files.find((file) => file.path === 'tools/core/cli.py');
    assert.deepEqual(cli.imports.map((site) => site.resolved.path).sort(), ['lib/extra/__init__.py', 'tools/core/__init__.py']);
  });
});
