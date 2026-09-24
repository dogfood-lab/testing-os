import { readFileSync } from 'node:fs';

export function render() {
  return readFileSync('out/index.json', 'utf8');
}
