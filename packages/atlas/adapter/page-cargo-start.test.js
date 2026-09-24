import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/cargo-start: a command whose CI runs only cargo test (see
// the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cargo-start');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('where to start reading a Rust command whose CI only tests it', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'src', globs: ['src/**'], role: 'code' },
    { name: 'tests', globs: ['tests/**'], role: 'test' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/cargo-start' }).json);

  it('reads a file cargo test runs for its own unit tests as a test, so the path follows the command', () => {
    assert.equal(data.startDoor, 'Cargo.toml#mile');
    assert.deepEqual(data.startHere, ['src/main.rs']);
    assert.equal(data.startReason, 'This path follows mile (a command people run) from its entry, since CI runs only tests.');
  });
});
