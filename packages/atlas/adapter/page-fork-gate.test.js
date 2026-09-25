import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/fork-gate: a job that skips a pull request from this
// repository, and one that runs only on a pull request from a fork (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/fork-gate');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a job held to where a pull request comes from', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
    { name: 'src', globs: ['src/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/fork-gate' });
  const data = JSON.parse(page.json);
  const door = (file) => structure.doors.find((entry) => entry.file === file);

  it('reads an if that skips a same-repository pull request as holding the job to a push and a fork\'s pull request', () => {
    assert.deepEqual(door('.github/workflows/ci.yml').runs[0].when, { also: ['push'], fork: true });
    assert.deepEqual(door('.github/workflows/forks.yml').runs[0].when, { event: 'pull_request', fork: true });
  });

  it('says so where the door runs, and never follows a pull request through it', () => {
    assert.ok(page.markdown.includes('On a push, or a pull request from a fork, it runs scripts/suite.mjs.'), page.markdown);
    assert.ok(page.markdown.includes('On a pull request from a fork, it runs scripts/suite.mjs.'), page.markdown);
    assert.match(page.markdown, /Read those in order to follow one push, or pull request from a fork, end to end\./);
    assert.equal(data.startDoor, '.github/workflows/ci.yml');
  });
});
