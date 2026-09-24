import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function writeCorpus(outDir, records) {
  writeFileSync(join(outDir, 'records.json'), JSON.stringify(records));
}

export function generate(outDir) {
  const dest = outDir ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus');
  writeCorpus(dest, [{ id: 1 }]);
  return dest;
}

const invokedAsMain = Boolean(
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)),
);
if (invokedAsMain) {
  generate();
}
