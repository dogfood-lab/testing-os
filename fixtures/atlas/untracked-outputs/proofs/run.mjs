import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'output');
const input = JSON.parse(readFileSync(join(here, 'case.json'), 'utf8'));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${input.name}.json`), JSON.stringify(input));
