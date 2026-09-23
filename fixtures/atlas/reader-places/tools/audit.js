import { readFileSync } from 'node:fs';

export function audit() {
  return JSON.parse(readFileSync('packages/ledger/scripts/a-receipt.json', 'utf8'));
}
