import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { FIXTURE, makeRepo } from './fixture-repo.js';

/**
 * A repository the shared helper makes is one git's background maintenance
 * leaves alone, so its cleanup cannot race a repack under .git. The setting
 * comes from the environment every test process shares
 * (scripts/lib/git-test-env.mjs), so it is read here the way any git a test
 * runs in the repository reads it.
 */

const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function configIn(root, key) {
  const result = spawnSync('git', ['config', '--get', key], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

describe('a repository the test helper makes', () => {
  it("has git's background maintenance turned off", () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    assert.equal(configIn(root, 'maintenance.auto'), 'false', 'no `git maintenance run --auto` after a commit');
    assert.equal(configIn(root, 'gc.auto'), '0', 'no automatic gc either');
  });
});
