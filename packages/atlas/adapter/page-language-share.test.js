import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/language-share: TypeScript holding a bare majority of the
// code, Rust nearly as much, and one JavaScript file (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/language-share');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the languages the first line names', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'core', globs: ['crates/core/**'], role: 'code' },
    { name: 'root', globs: ['*'], role: 'config' },
    { name: 'web', globs: ['web/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/language-share' });
  const data = JSON.parse(page.json);

  it('names every other language after the one that holds most of the code', () => {
    assert.match(data.derived, /^3 parts, mostly TypeScript \(4 files\), Rust \(2\) and JavaScript \(1\)\. /, data.derived);
  });
});
