import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/own-package: a site that takes the repository's own
// package by a file: path and imports it by name (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/own-package');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a file: dependency on the repository\'s own package', () => {
  it('resolves to that package, through its exports', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'site', globs: ['site/**'], role: 'site' },
      { name: 'types', globs: ['types/**'], role: 'code' },
      { name: 'src', globs: ['src/**'], role: 'code' },
      { name: 'root', globs: ['*'], role: 'config' },
    ];
    const mapped = mapRepository({ repoPath: root, boundaries });
    const pairs = mapped.edges.filter((edge) => edge.kind === 'file').map((edge) => `${edge.from}->${edge.to}`).sort();
    assert.deepEqual(pairs, ['site->src', 'site->types']);
    assert.equal(mapped.boundaries.find((boundary) => boundary.name === 'site').unresolvedSites, 0);
  });
});
