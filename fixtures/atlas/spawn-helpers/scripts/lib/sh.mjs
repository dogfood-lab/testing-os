import { spawnSync } from 'node:child_process';

export function sh(line) {
  return spawnSync(line, { shell: true, stdio: 'inherit' });
}
