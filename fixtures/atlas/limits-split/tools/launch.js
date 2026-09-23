import { spawnSync } from 'node:child_process';

export function launch(args) {
  return spawnSync(process.execPath, args);
}
