import { writeFileSync } from 'node:fs';

export function save() {
  writeFileSync('.tool/state.json', '{}\n');
  writeFileSync('reports/out.json', '{}\n');
}
