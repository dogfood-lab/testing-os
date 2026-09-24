import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveSong } from './loader.mjs';

export class Executor {
  start(songs) {
    this.home = mkdtempSync(join(tmpdir(), 'jam-'));
    for (const song of songs) saveSong(song, this.home);
  }
}

export function seed(songs) {
  const scratch = mkdtempSync(join(tmpdir(), 'seed-'));
  for (const song of songs) saveSong(song, scratch);
}
