import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PYTHON = process.env.PYTHON || 'python';
const SCRIPT = join(import.meta.dirname, '..', 'tools', 'gen.py');

test('gen refuses no count', () => {
  assert.notEqual(spawnSync(PYTHON, [SCRIPT]).status, 0);
});
