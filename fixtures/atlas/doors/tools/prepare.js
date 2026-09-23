import { writeFileSync } from 'node:fs';

export function prepare(id) {
  return String(id).trim();
}

const target = process.argv[2];
writeFileSync(target, 'prepared\n');
