import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stamps one block of README.md with the package version; the rest of the
// README is written by people.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const readmePath = resolve(repoRoot, 'README.md');
const { version } = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const readme = readFileSync(readmePath, 'utf8');
writeFileSync(readmePath, readme.replace(/v\d+\.\d+\.\d+/, `v${version}`));
