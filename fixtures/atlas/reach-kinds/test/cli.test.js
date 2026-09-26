import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

test('cli', () => {
  const result = spawnSync('reachtool', [], { encoding: 'utf8' });
  expect(result.stdout).toBe('reachtool\n');
});
