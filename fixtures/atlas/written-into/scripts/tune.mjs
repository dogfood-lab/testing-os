import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeSheet(sheet, label) {
  writeFileSync(join(process.cwd(), 'tuning', `matrix-${label}.json`), `${JSON.stringify(sheet)}\n`);
}

writeSheet({ rounds: 1 }, process.argv[2] ?? 'baseline');
