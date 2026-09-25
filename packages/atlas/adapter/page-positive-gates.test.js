import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/positive-gates: a job run only on a schedule or by hand,
// and a job held off a release event on a workflow that also runs by hand
// (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/positive-gates');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('gates that keep a run by hand', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }] }), '0'.repeat(40));
  const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/positive-gates' });
  const line = (name) => markdown.split('\n').find((text) => text.includes(`**${name}.**`)) ?? '';

  it('reads a gate written as the events it runs on as those events', () => {
    assert.ok(line('Operations').includes('On a schedule or by hand, it also runs scripts/sweep.mjs.'), line('Operations'));
    assert.ok(!/Except on/.test(line('Operations')), line('Operations'));
    // The workflow takes a push only to main, so the gate's push is one.
    assert.ok(line('Operations').includes('On a push to main or by hand, it also runs scripts/pack.mjs.'), line('Operations'));
  });

  it('keeps a run by hand when a gate holds a job off one event', () => {
    assert.ok(line('Release').includes('On a tag push or by hand, it also runs scripts/pack.mjs.'), line('Release'));
  });
});
