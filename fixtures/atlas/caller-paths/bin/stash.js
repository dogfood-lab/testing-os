#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Every path here is the user's: the directory they run the command in, one
// they pass, or their home directory. None of it is this repository.
export function init(dir) {
  const target = dir || '.';
  writeFileSync(join(target, 'node.json'), '{}\n');
  writeFileSync(join(target, '.gitignore'), 'keys/\n');
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  writeFileSync(resolve('data', 'cache.json'), '{}\n');
  writeFileSync(join(homedir(), '.stash', 'config.json'), '{}\n');
  writeFileSync('data/x.json', '{}\n');
  return readFileSync(join(process.env.HOME, '.stash', 'config.json'), 'utf8');
}

init(process.argv[2]);
