import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function walkUp(startDir) {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, 'projects'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveRootFrom(cwd, opts = {}) {
  const env = opts.env || process.env;
  const moduleRoot = opts.moduleRoot || join(here, '..');
  if (env.TOOL_ROOT && existsSync(env.TOOL_ROOT)) return resolve(env.TOOL_ROOT);
  const found = walkUp(cwd);
  if (found) return found;
  if (existsSync(join(moduleRoot, 'projects'))) return resolve(moduleRoot);
  return resolve(cwd);
}

let cached = null;

export function getWorkspaceRoot() {
  if (cached === null) cached = resolveRootFrom(process.cwd());
  return cached;
}

export const REPO_ROOT = getWorkspaceRoot();
