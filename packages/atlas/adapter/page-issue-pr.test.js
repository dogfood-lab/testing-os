import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/issue-pr: a job an issue starts commits to a branch and
// opens a pull request through github-script (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/issue-pr');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a gated job that opens a pull request', () => {
  it('says the pull request, and puts the gate on the whole phrase', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }] }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/issue-pr' });
    assert.match(markdown, /It commits registry\.json and pushes to a branch for review, never to main, and opens a pull request, on an `issues` event\./);
    assert.ok(!/never to main on an? `issues`/.test(markdown), markdown);
    // The event's name takes the article its first sound does.
    assert.ok(markdown.includes('On an `issues` event; on a push to main.'), markdown);
  });
});
