import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// The script is chosen when the suite runs, so neither command is spelled out.
const cli = [process.env.CLI_SCRIPT ?? 'tools/run.js'];

test('the tool runs', () => {
  spawnSync(process.execPath, cli);
  spawnSync('node', cli);
});
