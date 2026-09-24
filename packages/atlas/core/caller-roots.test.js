import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/caller-roots: writes whose place the caller decides, each by
// a different root (see the fixture's README), reached from a workflow.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/caller-roots');
const BOUNDARIES = [
  { name: 'bin', globs: ['bin/**'], role: 'code' },
  { name: 'src', globs: ['src/**'], role: 'code' },
  { name: 'tools', globs: ['tools/**'], role: 'code' },
  { name: 'data', globs: ['data/**'], role: 'config' },
  { name: 'root', globs: ['*'], role: 'config' },
];
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function map() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  return mapRepository({ repoPath: root, boundaries: BOUNDARIES });
}

function counts(mapped) {
  const out = {};
  for (const boundary of mapped.boundaries) {
    for (const file of boundary.files) {
      if ((file.outsideWrites ?? 0) + (file.dynamicWrites ?? 0) > 0) out[file.path] = [file.outsideWrites ?? 0, file.dynamicWrites ?? 0];
    }
  }
  return out;
}

describe('a write whose place the caller decides', () => {
  it('is counted outside, never as a path built at run time', () => {
    assert.deepEqual(counts(map()), {
      'src/env.js': [1, 0],
      'src/export.js': [2, 0],
      'src/store.js': [4, 0],
      'tools/camp.py': [5, 0],
    });
  });

  it('never lands on the tracked file a default shares its name with', () => {
    const mapped = map();
    assert.deepEqual(mapped.landings.filter((landing) => landing.writers.length > 0).map((landing) => landing.target), []);
  });

  it('is said under the limits line, and Hand-authored says nothing may land in it', () => {
    const structure = buildArtifact(map(), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/caller-roots' });
    assert.match(markdown, /- 12 writes go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository\./);
    assert.doesNotMatch(markdown, /may land here/);
    assert.doesNotMatch(markdown, /0 (writes|reads)/);
  });
});
