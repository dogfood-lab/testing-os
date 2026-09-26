import { spawn } from 'node:child_process';
import { expect, it } from 'vitest';

function runProcess(cmd: string, args: string[]) {
  return new Promise<number | null>((done) => {
    const child = spawn(cmd, args, { shell: true });
    child.on('close', done);
  });
}

it('exits cleanly', async () => {
  expect(await runProcess('node', ['bin/three.js'])).toBe(0);
});
