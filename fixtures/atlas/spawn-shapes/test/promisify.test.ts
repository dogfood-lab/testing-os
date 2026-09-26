import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

it('prints one', async () => {
  const { stdout } = await execFileAsync('node', ['bin/one.js', '--help']);
  expect(stdout).toContain('one');
});
