import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { both } from '../bin/both.js';

test('both', () => {
  expect(both()).toBe('both');
  expect(spawnSync(process.execPath, ['bin/both.js'], { encoding: 'utf8' }).stdout).toBe('both\n');
});
