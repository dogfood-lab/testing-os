import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function exportTo(outDir) {
  const root = resolve(outDir);
  const put = (relPath, text) => writeFileSync(join(root, relPath), text);
  put('assets/export.txt', 'x');
}
