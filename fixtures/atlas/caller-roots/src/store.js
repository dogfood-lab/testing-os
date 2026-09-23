import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dataDir, journalPath } from './defaults.js';

export function record(line) {
  mkdirSync(dataDir(), { recursive: true });
  appendFileSync(journalPath(), `${line}\n`);
  const tmp = journalPath() + '.tmp';
  writeFileSync(tmp, '');
  renameSync(tmp, journalPath());
}
