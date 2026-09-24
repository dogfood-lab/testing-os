import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/gated-runs: CI work held to a run by hand, to an input and to
// a pull request, and a release that publishes on a tag, by hand only with
// dry_run false, and releases only on a tag (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/gated-runs');
const BOUNDARIES = [
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  { name: 'src', globs: ['src/**'], role: 'code' },
];
const roots = [];
let structure;
let markdown;
let json;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  structure = buildArtifact(mapRepository({ repoPath: root, boundaries: BOUNDARIES }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/gated-runs' });
  markdown = page.markdown;
  json = JSON.parse(page.json);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function door(file) {
  return structure.doors.find((entry) => entry.file === file);
}

describe('work held to one trigger', () => {
  it('records a run inside a job or step held to a trigger with that trigger', () => {
    const runs = Object.fromEntries(door('.github/workflows/ci.yml').runs.map((run) => [run.path, run.when ?? null]));
    assert.deepEqual(runs, {
      'scripts/check.mjs': null,
      'scripts/cloud-generate.mjs': { event: 'workflow_dispatch', inputs: { run_generate: true } },
      'scripts/cloud-smoke.mjs': { event: 'workflow_dispatch' },
      'scripts/comment.mjs': { event: 'pull_request' },
    });
  });

  it('never credits a held run to another trigger\'s sentence, and says the trigger it runs on', () => {
    assert.ok(markdown.includes('1. **CI.** On a pull request; on a push to main; or by hand. Runs scripts/check.mjs. On a pull request, it also runs scripts/comment.mjs. When run by hand with run_generate true, it also runs scripts/cloud-generate.mjs. When run by hand, it also runs scripts/cloud-smoke.mjs.'), markdown);
    assert.ok(markdown.includes('2. On a pull request, it also runs scripts/comment.mjs.'), markdown);
    const ci = json.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.runs, ['scripts/check.mjs']);
    assert.deepEqual(ci.held.map((group) => group.when), ['on a pull request', 'when run by hand with run_generate true', 'when run by hand']);
  });

  it('gates a step on the tag it names, and a publish on the input that makes it a dry run', () => {
    const release = door('.github/workflows/release.yml');
    assert.equal(release.sends.releases, false);
    assert.deepEqual(release.sends.publishesTo, []);
    assert.deepEqual(release.gated.map((entry) => [entry.when, entry.sends]), [
      [{ event: 'push', tags: true }, ['releases']],
      [{ inputs: { dry_run: false } }, ['publishesTo:npm', 'packages:{"dir":"","name":"gated-runs","registry":"npm"}']],
    ]);
    assert.ok(markdown.includes('**Release** runs scripts/check.mjs, creates a GitHub release on a tag push, and publishes to npm (on a run by hand, only with dry_run false).'), markdown);
  });
});
