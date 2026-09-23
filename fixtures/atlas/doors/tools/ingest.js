import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { verify } from '../lib/verify.js';

const id = process.argv[2];
if (verify(id) && existsSync('indexes/latest.json')) {
  writeFileSync(`records/${id}.json`, '{}\n');
  writeFileSync('latest.json.tmp', '{}\n');
  renameSync('latest.json.tmp', 'indexes/latest.json');
}
