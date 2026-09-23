import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function notes() {
  if (process.env.GITHUB_ACTIONS) return;
  writeFileSync(join(root, 'NOTES.md'), '# Notes\n');
}

if (!process.env.CI) {
  writeFileSync(join(root, 'LOCAL.md'), '# Local\n');
} else {
  console.log('in CI');
}

notes();
