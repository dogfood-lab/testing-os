import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/rust-caller-paths: writes under a field and a parameter
// that main sets from the directory it is run in, and under Tauri's app data
// directory (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/rust-caller-paths');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('Rust writes rooted at a place the caller builds', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'root', globs: ['*'], role: 'config' },
    { name: 'src', globs: ['src/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/rust-caller-paths' }).json);
  const src = structure.boundaries.find((boundary) => boundary.name === 'src');

  it('counts a write under a field or a parameter set from the working directory as outside, never built at run time', () => {
    assert.equal(src.dynamicWrites, 0);
    assert.equal(src.outsideWrites, 4);
    assert.ok(!data.limits.some((line) => line.includes('built at run time')), data.limits.join('\n'));
  });

  it('says where they go: the directory the command is run in, under the directory main names, and the home directory', () => {
    assert.ok(data.limits.includes('3 writes go to the directory the command is run in (saves/), not to this repository.'), data.limits.join('\n'));
    assert.ok(data.limits.includes('1 write goes to the home directory, not to this repository.'), data.limits.join('\n'));
  });
});
