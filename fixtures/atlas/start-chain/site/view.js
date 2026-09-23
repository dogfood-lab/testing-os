import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const out = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'out.json'), 'utf8');
