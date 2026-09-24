import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/godot-landings: a save script and a baking tool (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/godot-landings');
const BOUNDARIES = [
  { name: 'data', globs: ['data/**'], role: 'data' },
  { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
];
const roots = [];
let mapped;
let files;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
  files = new Map(mapped.boundaries.flatMap((boundary) => boundary.files).map((file) => [file.path, file]));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what a Godot script writes and reads', () => {
  it('reads and writes the project\'s files by their res:// paths', () => {
    assert.deepEqual(files.get('scripts/save.gd').reads.map((read) => [read.target, read.call]), [['data/table.json', 'open']]);
    assert.deepEqual(files.get('scripts/bake.gd').writes.map((write) => [write.target, write.call]), [['data/baked.json', 'open'], ['data/level.tres', 'save']]);
    assert.equal(files.get('scripts/bake.gd').dynamicWrites, 1);
  });

  it('counts what goes to user:// as the player\'s data directory', () => {
    const save = files.get('scripts/save.gd');
    assert.equal(save.userDataWrites, 2);
    assert.equal(save.userDataReads, 1);
    assert.deepEqual(save.writes, []);
  });

  it('credits the workflow that runs the tool with what it bakes, and says where the saves go', () => {
    assert.deepEqual(mapped.doors.find((door) => door.name === 'bake').landings, ['data/baked.json', 'data/level.tres']);
    const structure = buildArtifact(mapped, '0'.repeat(40));
    const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/godot-landings' }).json);
    assert.ok(data.limits.includes('2 writes and 1 read go to the player\'s data directory (user://), not to this repository.'), data.limits.join('\n'));
  });
});
