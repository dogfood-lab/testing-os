import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pad from 'left-pad';

// Where the backup copy goes is chosen by whoever runs the store.
function backupFile() {
  return globalThis.STORE_BACKUP_FILE;
}

export function save(entry) {
  writeFileSync('data/latest.json', `${JSON.stringify(entry)}\n`);
  writeFileSync(join(tmpdir(), 'store-last.json'), JSON.stringify(entry));
  return pad(String(entry.id), 8);
}

export function restore() {
  return JSON.parse(readFileSync(backupFile(), 'utf8'));
}

save({ id: process.argv[2] ?? 'manual' });
