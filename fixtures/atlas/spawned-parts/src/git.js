import { spawnSync } from 'node:child_process';

export function status(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}
