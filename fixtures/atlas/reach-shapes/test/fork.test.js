import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

test('the worker reports ready', async () => {
  const helperPath = resolve(import.meta.dirname, '../scripts/worker.mjs');
  const child = fork(helperPath, []);
  await new Promise((done) => child.on('exit', done));
});
