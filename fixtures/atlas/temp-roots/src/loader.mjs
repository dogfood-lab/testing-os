import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function saveSong(song, home) {
  const dir = join(home, 'songs');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${song.id}.json`);
  writeFileSync(path, JSON.stringify(song));
  return path;
}
