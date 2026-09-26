import { readFileSync } from 'node:fs';

export function report() {
  return readFileSync('data/state.json', 'utf8');
}
