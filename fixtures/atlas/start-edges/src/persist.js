import { writeFileSync } from 'node:fs';

export function persist(result) {
  writeFileSync('out/index.json', JSON.stringify(result));
}
