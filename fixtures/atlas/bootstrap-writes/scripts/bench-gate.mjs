import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = resolve(REPO_ROOT, 'tests', '__bench__', 'baseline.json');

if (!existsSync(BASELINE_PATH)) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ benches: {} }, null, 2));
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
console.log(Object.keys(baseline.benches).length);
