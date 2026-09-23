import { readFileSync } from 'node:fs';
import { checkPolicy } from './policy.js';
import { checkSchema, schema } from './schema.js';

function runCheck(check, input) {
  return check(input);
}

export function verify(input, provenance) {
  const policy = readFileSync('policies/global.yaml', 'utf8');
  const shaped = runCheck(checkSchema, input);
  const allowed = checkPolicy(policy);
  const confirmed = provenance ? provenance.confirm(input) : true;
  return typeof input === 'string' && input.startsWith(schema.name) && shaped && allowed && confirmed;
}
