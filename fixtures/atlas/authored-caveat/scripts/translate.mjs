import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'README.md'), 'utf8');
for (const lang of process.argv.slice(2)) writeFileSync(join(root, `README.${lang}.md`), source);
