import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/image-pack: a repository that is mostly sprites, held in a
// package with a package.json and a pack.json, beside one file of code in
// each of three languages (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/image-pack');
const roots = [];
let structure;
let markdown;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  // No role is written for heroes, so the map derives it the way init does.
  const mapped = mapRepository({
    repoPath: root,
    boundaries: [
      { name: 'heroes', globs: ['packages/heroes/**'] },
      { name: 'scripts', globs: ['scripts/**'], role: 'code' },
      { name: 'src', globs: ['src/**'], role: 'code' },
    ],
  });
  structure = buildArtifact(mapped, '0'.repeat(40));
  ({ markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/image-pack' }));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a repository of mostly images', () => {
  it('says the images first and names every language its code is in', () => {
    const first = markdown.split('\n').find((line) => line.startsWith('3 parts'));
    assert.ok(first?.startsWith('3 parts, mostly images (8 files); code in JavaScript (1), Python (1) and TypeScript (1).'), markdown);
  });

  it('makes a part of mostly images data, though it holds a manifest', () => {
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'heroes').role, 'data');
  });
});
