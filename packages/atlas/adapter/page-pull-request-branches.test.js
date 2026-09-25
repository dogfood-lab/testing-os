import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/pull-request-branches: a pull request filtered by the
// branch it targets (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/pull-request-branches');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a pull request filtered by branch', () => {
  it('says the branch, as a push says it', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }] }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/pull-request-branches' });
    assert.ok(markdown.includes('1. **CI.** On a pull request to main touching 2 paths; on a push to main. Runs scripts/check.mjs.'), markdown);
    assert.deepEqual(JSON.parse(json).doors[0].triggers, ['on a pull request to main touching 2 paths', 'on a push to main']);
  });
});
