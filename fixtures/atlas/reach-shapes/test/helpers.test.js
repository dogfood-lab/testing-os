import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(import.meta.dirname, '..');
const CHECK = join(ROOT, 'scripts', 'check.mjs');
const SWEEP = join(ROOT, 'scripts', 'sweep.mjs');

function runNode(args) {
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('check refuses without --dir', () => {
  assert.notEqual(runNode([CHECK]).status, 0);
});

test('sweep sweeps', () => {
  assert.match(run(SWEEP, ['--help']).stdout, /swept/);
});
