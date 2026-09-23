import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const cli = ['tools/run.js'];

test('the tool runs', () => {
  spawnSync(process.execPath, cli);
  spawnSync('node', cli);
});
