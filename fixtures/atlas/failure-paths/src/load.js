import { readFileSync } from 'node:fs';

export function loadConfig(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
}
