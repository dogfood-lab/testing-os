import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

spawnSync(process.execPath, [join(repoRoot, 'scripts', 'gate.mjs')], { cwd: repoRoot });
