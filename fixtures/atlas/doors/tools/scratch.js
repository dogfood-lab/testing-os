import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function scratch(dir, name) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.gitignore'), 'out/\n');
  writeFileSync(join(dir, 'records', `${name}.json`), '{}\n');
}
