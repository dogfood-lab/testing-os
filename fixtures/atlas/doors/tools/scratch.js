import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The directory is one the engine cannot read: neither a literal, nor a place
// the caller passes, nor one a function of this repository returns.
function scratchDirectory() {
  return globalThis.SCRATCH_DIRECTORY;
}

export function scratch(name) {
  const dir = scratchDirectory();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.gitignore'), 'out/\n');
  writeFileSync(join(dir, 'records', `${name}.json`), '{}\n');
}
