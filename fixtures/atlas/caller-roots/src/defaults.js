import { homedir } from 'node:os';
import { join } from 'node:path';

export function dataDir() {
  return join(homedir(), '.guard');
}

export function journalPath() {
  return join(dataDir(), 'journal.jsonl');
}
