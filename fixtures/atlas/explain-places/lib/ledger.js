import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LEDGER = 'store/ledger';

export function appendEntry(entry) {
  mkdirSync(LEDGER, { recursive: true });
  writeFileSync(join(LEDGER, `${entry.id}.json`), `${JSON.stringify(entry)}\n`);
}
