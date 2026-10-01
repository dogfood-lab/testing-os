import { readFileSync } from 'node:fs';

export function serve() {
  return JSON.parse(readFileSync('data/report.json', 'utf8'));
}
