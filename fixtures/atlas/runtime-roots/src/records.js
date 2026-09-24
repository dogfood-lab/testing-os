import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeRecord(record, repoRoot) {
  writeFileSync(join(repoRoot, 'records', `${record.id}.json`), '{}\n');
}
