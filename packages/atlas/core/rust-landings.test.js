import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/rust-landings: a binary that writes and reads by literal,
// by its crate's directory and by places its caller decides (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/rust-landings');
const BOUNDARIES = [
  { name: 'data', globs: ['data/**'], role: 'data' },
  { name: 'reports', globs: ['reports/**'], role: 'data' },
  { name: 'root', globs: ['*', '.github/**', 'snapshots/**'], role: 'config' },
  { name: 'src', globs: ['src/**'], role: 'code' },
];
const roots = [];
let mapped;
let main;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
  main = mapped.boundaries.find((boundary) => boundary.name === 'src').files.find((file) => file.path === 'src/main.rs');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what a Rust program writes and reads', () => {
  // save() is handed PathBuf::from("snapshots") by main's one call, so its
  // write lands there, as a parameter a call hands a literal does.
  it('writes a place a literal names, and reads one its crate\'s directory names', () => {
    assert.deepEqual(main.writes.map((write) => [write.target, write.call]), [['reports/summary.txt', 'write'], ['snapshots/state.ron', 'write']]);
    assert.deepEqual(main.reads.map((read) => [read.target, read.call]), [['data/rates.csv', 'read_to_string']]);
  });

  it('counts a write to a place the caller decides as outside, and one built at run time as unnamed', () => {
    assert.equal(main.outsideWrites, 4);
    assert.equal(main.dynamicWrites, 1);
  });

  it('leaves out what a unit test writes', () => {
    assert.ok(!main.writes.some((write) => write.target.includes('scratch')));
  });

  it('credits the workflow that runs the binary with the report, and says where the rest goes', () => {
    const nightly = mapped.doors.find((door) => door.name === 'Nightly');
    assert.deepEqual(nightly.landings, ['reports/summary.txt', 'snapshots/state.ron']);
    const structure = buildArtifact(mapped, '0'.repeat(40));
    const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/rust-landings' }).json);
    assert.ok(data.limits.includes('2 writes go to a path their caller passes, not to this repository.'), data.limits.join('\n'));
    assert.ok(data.limits.includes('1 write goes to the directory the command is run in (cache/), not to this repository.'), data.limits.join('\n'));
    assert.ok(data.limits.includes('1 write goes to the home directory (.ledger), not to this repository.'), data.limits.join('\n'));
    assert.ok(data.limits.includes('1 write uses a path built at run time and is not named here.'), data.limits.join('\n'));
  });
});
