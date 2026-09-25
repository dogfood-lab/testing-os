import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/test-place-readers: a place code writes that code and a
// test read (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/test-place-readers');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a written place tests read', () => {
  it('counts the tests among the readers a hand edit reaches', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'tools', globs: ['tools/**'], role: 'code' },
      { name: 'scripts', globs: ['scripts/**'], role: 'code' },
      { name: 'tests', globs: ['tests/**'], role: 'test' },
      { name: 'data', globs: ['data/**'], role: 'data' },
    ];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/test-place-readers' });
    assert.ok(markdown.includes('- **data/graphs.json** is written by tools and read by scripts, and by 1 test; a hand edit reaches every reader.'), markdown);
  });
});
