import { writeFileSync } from 'node:fs';
import { checkPolicy } from '../lib/policy.js';
import { checkSchema } from '../lib/schema.js';

export function prepare(id) {
  checkSchema(id);
  checkPolicy(String(id));
  return String(id).trim();
}

const target = process.argv[2];
writeFileSync(target, 'prepared\n');
