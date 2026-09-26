import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function emit(dir) {
  writeFileSync(join(dir, 'out.json'), '{}\n');
}
