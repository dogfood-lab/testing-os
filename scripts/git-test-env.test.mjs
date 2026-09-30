import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withMaintenanceOff } from './lib/git-test-env.mjs';

/**
 * Git's background maintenance is off in every repository a test creates,
 * because every test process loads scripts/lib/git-test-env.mjs before its
 * first line: each workspace's `node --test` script and the root test:scripts
 * name it. A new package, or a script edited without it, fails here rather
 * than as an ENOTEMPTY on some later CI leg. The setting read in a repository
 * a test makes is packages/atlas/core/fixture-repo.test.js; importing the
 * module here would set it in this process and prove nothing.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FROM_PACKAGE = '--import=../../scripts/lib/git-test-env.mjs';
const FROM_ROOT = '--import=./scripts/lib/git-test-env.mjs';

function manifest(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

describe('the environment every test process shares', () => {
  it('is loaded by every node --test script, in the root and in every workspace', () => {
    const scripts = [];
    for (const [name, script] of Object.entries(manifest(ROOT).scripts)) {
      if (/\bnode\s+--test\b/.test(script)) scripts.push({ where: `package.json ${name}`, script, flag: FROM_ROOT });
    }
    for (const entry of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let pkg;
      try {
        pkg = manifest(join(ROOT, 'packages', entry.name));
      } catch {
        continue;
      }
      for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
        if (/\bnode\s+--test\b/.test(script)) scripts.push({ where: `packages/${entry.name} ${name}`, script, flag: FROM_PACKAGE });
      }
    }
    assert.ok(scripts.length >= 8, `the node --test scripts were found (${scripts.length})`);
    for (const { where, script, flag } of scripts) {
      assert.ok(script.split(/\s+/).includes(flag), `${where} loads the shared git environment: ${script}`);
    }
  });

  it("keeps the configuration the host already set, and adds nothing twice", () => {
    const host = { PATH: 'bin', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.pager', GIT_CONFIG_VALUE_0: 'cat' };
    const once = withMaintenanceOff(host);
    assert.equal(once.GIT_CONFIG_COUNT, '3');
    assert.deepEqual([once.GIT_CONFIG_KEY_0, once.GIT_CONFIG_VALUE_0], ['core.pager', 'cat']);
    assert.deepEqual([once.GIT_CONFIG_KEY_1, once.GIT_CONFIG_VALUE_1], ['maintenance.auto', 'false']);
    assert.deepEqual([once.GIT_CONFIG_KEY_2, once.GIT_CONFIG_VALUE_2], ['gc.auto', '0']);
    assert.deepEqual(withMaintenanceOff(once), once, 'a child process that loads it again changes nothing');
    assert.equal(host.GIT_CONFIG_COUNT, '1', 'the environment given is not changed');
    const bare = withMaintenanceOff({});
    assert.deepEqual([bare.GIT_CONFIG_COUNT, bare.GIT_CONFIG_KEY_0, bare.GIT_CONFIG_KEY_1], ['2', 'maintenance.auto', 'gc.auto']);
  });
});
