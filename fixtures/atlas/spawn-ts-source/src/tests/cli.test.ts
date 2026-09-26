import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));

test('--help prints usage', () => {
  const run = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
});
