import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function persist(record) {
  const base = record.rejected ? 'store/_rejected' : 'store';
  const path = join(ROOT, base, record.org, `${record.id}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record)}\n`);
}

persist(JSON.parse(process.argv[2]));
