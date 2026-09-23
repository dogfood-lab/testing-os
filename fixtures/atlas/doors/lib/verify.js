import { readFileSync } from 'node:fs';
import { schema } from './schema.js';

export function verify(input) {
  const policy = readFileSync('policies/global.yaml', 'utf8');
  return typeof input === 'string' && input.startsWith(schema.name) && policy.length > 0;
}
