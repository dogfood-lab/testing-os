import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function save(value) {
  writeFileSync(join(root, 'data', 'out.json'), JSON.stringify(value));
}
