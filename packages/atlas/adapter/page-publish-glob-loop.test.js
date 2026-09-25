import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/publish-glob-loop: a release loop over packages/*/ that
// packs and publishes each public package (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/publish-glob-loop');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a publish loop over a directory glob', () => {
  it('publishes every public package the glob covers, by name', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'packages', globs: ['packages/**'], role: 'code' }] }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/publish-glob-loop' });
    assert.ok(markdown.includes('It publishes @g/a (packages/a) and @g/b (packages/b) to npm.'), markdown);
    assert.ok(!markdown.includes('chosen at run time'), markdown);
  });
});
