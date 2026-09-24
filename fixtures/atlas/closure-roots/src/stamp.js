import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function stamp() {
  const put = (relPath, text) => writeFileSync(join(here, '..', relPath), text);
  put('out/stamp.txt', 'stamped');
}
