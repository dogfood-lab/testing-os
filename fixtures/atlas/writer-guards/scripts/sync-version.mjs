import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = resolve(here, '..', 'README.md');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
// Stamping the runner's checkout would hide drift from a later --check.
const IN_CI = process.env.CI === 'true' || Boolean(process.env.GITHUB_ACTIONS);

const readme = readFileSync(readmePath, 'utf8');
const next = readme.replace(/v\d+\.\d+\.\d+/, 'v1.0.0');
if (CHECK) {
  process.exit(next === readme ? 0 : 1);
}
if (IN_CI) {
  console.log('refusing to write README.md in CI');
  process.exit(0);
}
writeFileSync(readmePath, next);
