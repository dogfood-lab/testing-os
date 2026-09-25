import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function openDb(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
}

openDb('state/app.db');
