import { existsSync, writeFileSync } from 'node:fs';

export function remember(state) {
  if (existsSync('cache/state.json')) return false;
  writeFileSync('cache/state.json', JSON.stringify(state));
  return true;
}
