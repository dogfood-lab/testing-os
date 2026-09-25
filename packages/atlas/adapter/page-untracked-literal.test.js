import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/untracked-literal: an example and a script writing to
// literal places the repository ignores (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/untracked-literal');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a write to a literal place nothing tracks', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'examples', globs: ['examples/**'], role: 'code' },
    { name: 'forge', globs: ['src/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/untracked-literal' });
  const data = JSON.parse(page.json);

  it('lands on the place it spells, untracked, whatever language writes it', () => {
    const landing = (target) => structure.landings.find((item) => item.target === target);
    assert.deepEqual(landing('output')?.writers.map((entry) => entry.by), ['examples/export_all.rs'], JSON.stringify(structure.landings));
    assert.equal(landing('output').tracked, false);
    assert.deepEqual(landing('reports')?.writers.map((entry) => entry.by), ['scripts/report.mjs']);
    assert.equal(landing('reports').tracked, false);
  });

  it('names no place for a literal the home directory falls back to, nor for an absolute path', () => {
    const targets = structure.landings.map((item) => item.target);
    assert.ok(!targets.some((target) => target.includes('.state') || target.startsWith('E:')), JSON.stringify(targets));
  });

  it('names where each door writes, as not tracked, and counts none as built at run time', () => {
    assert.ok(page.markdown.includes('3. It writes to output/, which is not tracked.'), page.markdown);
    assert.ok(page.markdown.includes('export_all writes only to output/, which is not tracked.'), page.markdown);
    assert.ok(page.markdown.includes('**CI** runs scripts/db.mjs, scripts/report.mjs and scripts/state.mjs, and writes to reports/ and state/app.db, which are not tracked.'), page.markdown);
    assert.equal(data.doors.find((door) => door.name === 'export_all').untracked, 'output/, which is not tracked');
    assert.ok(!data.limits.some((line) => line.includes('built at run time')), data.limits.join('\n'));
    assert.ok(data.limits.includes('3 writes go to places this repository does not track, so they are not listed as generated.'), data.limits.join('\n'));
  });
});
