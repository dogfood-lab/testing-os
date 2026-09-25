import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/checkout-path: a job that works on this repository through
// the directory it checks it out into (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/checkout-path');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('paths spelled through the directory a job checks this repository out into', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [
    { name: 'fixtures', globs: ['fixtures/**'], role: 'data' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ] });
  const ci = mapped.doors.find((door) => door.file === '.github/workflows/ci.yml');
  const landing = (target) => mapped.landings.find((item) => item.target === target);

  it('reads a path through the checkout from the workspace root as this repository\'s', () => {
    assert.ok(ci.mentions.some((mention) => mention.path === '.github/pins.env'), JSON.stringify(ci.mentions));
    assert.deepEqual(landing('.github/pins.env')?.readers.map((entry) => entry.by), ['.github/workflows/ci.yml']);
  });

  it('reads a place handed to an output flag from a sibling checkout as written by the door, and a check of it as no write', () => {
    assert.deepEqual(ci.landings, ['fixtures']);
    assert.deepEqual(landing('fixtures')?.writers.map((entry) => entry.by), ['.github/workflows/ci.yml']);
  });
});
