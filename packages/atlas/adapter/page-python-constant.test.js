import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/python-constant: a command whose only import is a module
// holding one constant (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/python-constant');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a Python module that holds one constant', () => {
  it('is never where the path ends', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'tool', globs: ['tool/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'config' }] }), '0'.repeat(40));
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/python-constant' });
    assert.deepEqual(JSON.parse(json).startHere, ['tool/cli.py']);
  });
});
