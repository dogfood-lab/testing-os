import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'seed.json');

let seed;
try {
  seed = JSON.parse(readFileSync(SEED, 'utf8'));
} catch {
  seed = {};
  writeFileSync(SEED, '{}\n');
}
console.log(seed);
