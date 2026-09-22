import { schema } from './schema.js';

export function verify(input) {
  return typeof input === 'string' && input.startsWith(schema.name);
}
