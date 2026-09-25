import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/workspace-paths: scripts run by their path from the
// checkout's root, one from outside it (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/workspace-paths');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a path spelled from the checkout\'s root', () => {
  it('is this repository\'s file, even after the step leaves the checkout', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    const ci = mapped.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.runs.map((run) => run.path), ['cli/init.mjs', 'scripts/local.mjs']);
  });
});
