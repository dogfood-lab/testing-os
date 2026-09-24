import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function rows() {
  return [{ id: 1 }];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(join(here, '..', 'data', 'out.json'), JSON.stringify(rows()));
}
