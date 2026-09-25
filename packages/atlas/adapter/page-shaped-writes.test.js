import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/shaped-writes: a write named at run time right under a
// tracked directory that also holds hand-written files (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/shaped-writes');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a write named by its shape', () => {
  it('lands on the files of that shape, not on the directory beside hand-written files', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'bundles', globs: ['bundles/**'], role: 'data' }, { name: 'scripts', globs: ['scripts/**'], role: 'code' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const written = structure.landings.filter((landing) => landing.writers.some((entry) => entry.by === 'scripts/build-bundles.mjs'));
    assert.deepEqual(written.map((landing) => [landing.target, landing.tracked ?? true]), [['bundles/*.json', true]]);
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/shaped-writes' });
    assert.ok(markdown.includes('- **bundles/*.json** is written by scripts/build-bundles.mjs.'), markdown);
    assert.ok(!markdown.includes('**bundles/** is written'), markdown);
    // A run directory named at run time beside runs/README.md is no shape a
    // tracked file has: it stays output nothing tracks, runs/ people's.
    const run = structure.landings.find((landing) => landing.writers.some((entry) => entry.by === 'scripts/record-run.mjs'));
    assert.equal(run.tracked, false, JSON.stringify(run));
  });
});
