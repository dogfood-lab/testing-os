import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function receipt(id) {
  return { id };
}

function cmdFetch() {
  const dest = join(dirname(fileURLToPath(import.meta.url)), 'runs');
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'state.json'), JSON.stringify(receipt(1)));
}

const invokedAsCli = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsCli) {
  const table = { fetch: cmdFetch };
  table[process.argv[2]]();
}
