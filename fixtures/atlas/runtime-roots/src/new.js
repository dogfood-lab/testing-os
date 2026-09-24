import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './git.js';

export function create(args) {
  const root = repoRoot(args.cwd);
  writeFileSync(join(root, '.bridge', 'thread.json'), '{}\n');
}
