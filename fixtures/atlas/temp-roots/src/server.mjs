import { saveSong } from './loader.mjs';
import { jamHome } from './home.mjs';

export function addSong(song) {
  return saveSong(song, jamHome());
}
