import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { auditRecord, loadPolicy } from '../lib/policy.js';
import { rebuildIndex, sealRecord, writeRecord } from '../lib/store.js';
import { verify } from '../lib/verify.js';
import { prepare } from './prepare.js';

function persist(id) {
  writeRecord(id);
  rebuildIndex();
}

export async function ingest() {
  const id = prepare(process.argv[2]);
  if (verify(id) && existsSync('indexes/latest.json')) {
    loadPolicy();
    persist(id);
    auditRecord(id);
    sealRecord(id);
    writeFileSync(`records/${id}.json`, '{}\n');
    writeFileSync('latest.json.tmp', '{}\n');
    renameSync('latest.json.tmp', 'indexes/latest.json');
  }
}

await ingest();
