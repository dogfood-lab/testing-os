import { spawnSync } from 'node:child_process';

const result = spawnSync('node', ['scripts/check.mjs'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr);
