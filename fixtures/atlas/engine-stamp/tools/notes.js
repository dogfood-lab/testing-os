import { readFileSync } from 'node:fs';

export function notes(path) {
  return readFileSync(path, 'utf8').split('\n').slice(0, 10).join('\n');
}

console.log(notes(process.argv[2]));
