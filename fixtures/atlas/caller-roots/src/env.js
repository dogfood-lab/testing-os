import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function saveEnv() {
  writeFileSync(join(process.env.GUARD_HOME, 'state.json'), '{}\n');
}
