import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/review-pushes: two workflows that push a branch of their own
// for review, one that pushes to a branch kept for its own sake, and one that
// pushes to main.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/review-pushes');
const BOUNDARIES = [
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  { name: 'lib', globs: ['lib/**'], role: 'code' },
  { name: 'logos', globs: ['logos/**'], role: 'config' },
  { name: 'root', globs: ['*'], role: 'config' },
];
const roots = [];
let structure;
let markdown;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  structure = buildArtifact(mapRepository({ repoPath: root, boundaries: BOUNDARIES }), '0'.repeat(40));
  markdown = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/review-pushes' }).markdown;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function door(file) {
  return structure.doors.find((item) => item.file === `.github/workflows/${file}`);
}

describe('a push to a branch for review', () => {
  it('is told apart from a push to main, a branch made in an earlier step included', () => {
    assert.deepEqual([door('sync.yml').pushes, door('sync.yml').pushesForReview], [false, true]);
    assert.deepEqual([door('freshness.yml').pushes, door('freshness.yml').pushesForReview], [false, true]);
    assert.deepEqual([door('release.yml').pushes, door('release.yml').pushesForReview ?? false], [true, false]);
  });

  it('names a branch kept for its own sake, where no pull request is opened for it', () => {
    assert.deepEqual([door('render.yml').pushes, door('render.yml').pushesForReview ?? false, door('render.yml').pushesTo], [false, false, ['render']]);
    assert.match(markdown, /\*\*render\*\* runs scripts\/changelog\.mjs, writes to CHANGELOG\.md, and commits CHANGELOG\.md and pushes to the render branch, not to main\./);
  });

  it('is said as never to main, and does not make the door the busiest', () => {
    assert.match(markdown, /the busiest is release, which reaches 1 part and commits into the repository \(sync logos reaches 2 but commits only to a branch for review\)\./);
    assert.match(markdown, /\*\*sync logos\*\* runs scripts\/sync\.mjs, reaches lib, writes to logos\/org\.svg, commits logos\/ and pushes to a branch for review, never to main, and opens a pull request\./);
    assert.match(markdown, /\*\*freshness\*\* runs scripts\/changelog\.mjs, writes to CHANGELOG\.md, and commits CHANGELOG\.md and pushes to a branch for review, never to main\./);
  });
});
