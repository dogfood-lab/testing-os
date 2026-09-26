import { readFileSync } from 'node:fs';

const latest = JSON.parse(readFileSync('store/ledger/latest.json', 'utf8'));
console.log(latest.id);
