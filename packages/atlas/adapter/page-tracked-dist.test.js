import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/tracked-dist: a script writes into a dist/ the repository
// commits (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/tracked-dist');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a dist/ the repository tracks', () => {
  it('is a place code writes, generated, never output nobody keeps', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'dist', globs: ['dist/**'], role: 'data' }, { name: 'scripts', globs: ['scripts/**'], role: 'code' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/tracked-dist' });
    assert.ok(!markdown.includes('not tracked'), markdown);
    assert.ok(markdown.includes('- **dist/registry.json** is written by scripts/build.mjs.') || markdown.includes('- **dist/** is written by scripts/build.mjs.'), markdown);
  });
});
