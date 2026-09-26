import { writeFileSync } from 'node:fs';

export function record(state) {
  writeFileSync('data/state.json', `${JSON.stringify(state)}\n`);
}
