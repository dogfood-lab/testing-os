import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/mostly-data: most tracked files are JSON (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/mostly-data');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a repository that is mostly data', () => {
  it('says so first, then the code', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'data', globs: ['data/**'], role: 'data' }, { name: 'scripts', globs: ['scripts/**'], role: 'code' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/mostly-data' });
    assert.match(JSON.parse(json).derived, /^2 parts, mostly JSON data \(7 files\); code in JavaScript \(1\)\./);
  });
});
