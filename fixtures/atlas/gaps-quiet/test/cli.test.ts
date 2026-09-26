import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

test('cli', () => {
  expect(spawnSync('quietcli', [], { encoding: 'utf8' }).stdout).toBe('quietcli\n');
});
