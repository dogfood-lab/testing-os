import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/stage-read: a workflow that reads and stages what the
// script it runs writes (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/stage-read');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a file a workflow reads and stages', () => {
  it('is written by the script the workflow runs, never by the workflow', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    const writers = mapped.landings.find((landing) => landing.target === 'data/stats.json').writers.map((entry) => entry.by);
    assert.deepEqual(writers, ['scripts/fetch.mjs']);
  });
});
