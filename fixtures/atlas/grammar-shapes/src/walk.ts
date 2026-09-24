import { readdirSync } from 'node:fs';
import { mint } from './mint.js';

export function walk(dir: string): string[] {
  let entries: import("node:fs").Dirent[];
  entries = readdirSync(dir, { withFileTypes: true });
  return entries.map((entry) => mint(entry.name));
}
