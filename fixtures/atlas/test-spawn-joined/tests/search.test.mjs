import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const queryScript = join(rootDir, 'scripts', 'query.mjs');

function runQuery(args) {
  const cmd = `node "${queryScript}" ${args} --json`;
  return JSON.parse(execSync(cmd, { encoding: 'utf-8' }));
}

runQuery('--name tool');
