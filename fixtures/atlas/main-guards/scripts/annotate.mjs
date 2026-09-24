import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function applyAnnotations(libraryDir, notes) {
  writeFileSync(join(libraryDir, 'index.json'), JSON.stringify(notes));
}

function main() {
  applyAnnotations(join(here, '..', 'library'), { ready: true });
}

const isMain = import.meta.url === `file://${process.argv[1]}` || fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
