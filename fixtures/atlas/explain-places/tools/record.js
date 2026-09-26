import { appendEntry } from '../lib/ledger.js';

appendEntry({ id: process.argv[2] ?? 'manual', at: new Date().toISOString() });
