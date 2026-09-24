import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/godot-runs: a CI job that checks this repository out into a
// directory of its own and runs Godot, GUT and gdtoolkit there, and a
// release that exports the game (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/godot-runs');
const BOUNDARIES = [
  { name: 'addons', globs: ['addons/**'], role: 'code' },
  { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  { name: 'scenes', globs: ['scenes/**'], role: 'code' },
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  { name: 'test', globs: ['test/**'], role: 'test' },
  { name: 'tools', globs: ['tools/**'], role: 'code' },
];
const roots = [];
let mapped;

function door(name) {
  const found = mapped.doors.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what a workflow runs in a Godot project', () => {
  it('reads the directory a job checks this repository out into as its root, and the other checkout as outside it', () => {
    const runs = door('ci').runs.map((run) => [run.path, run.runKind, run.via ?? null]);
    assert.deepEqual(runs, [
      ['addons/gut/gut_cmdln.gd', 'executes', null],
      ['scripts/', 'checks', null],
      ['test/unit/test_player.gd', 'executes', 'gut'],
      ['tools/', 'checks', null],
      ['tools/headless.gd', 'executes', null],
    ]);
  });

  it('exports the game for the platform its preset names, as a send', () => {
    const release = door('release');
    assert.deepEqual(release.sends.exports, ['Linux']);
    assert.deepEqual(release.runs, []);
    const structure = buildArtifact(mapped, '0'.repeat(40));
    const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/godot-runs' });
    assert.ok(JSON.parse(page.json).doors.find((entry) => entry.name === 'release').sends.includes('exports the game for Linux'));
  });

  it('reaches from the runner into what it preloads', () => {
    assert.ok(door('ci').reach.some((entry) => entry.boundary === 'tools'));
    assert.ok(door('ci').reach.some((entry) => entry.boundary === 'test'));
  });
});
