import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

test('tool', () => {
  const result = spawnSync(process.execPath, ['bin/tool.js'], { encoding: 'utf8' });
  expect(result.stdout).toBe('tool\n');
});
