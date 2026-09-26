import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROOT } from './helpers.mjs';

test('gen refuses no name', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gen.mjs')]);
  assert.notEqual(result.status, 0);
});
