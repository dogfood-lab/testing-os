import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/paths.js';

const PROJECTS_DIR = join(REPO_ROOT, 'projects');

export function run(name) {
  const projectDir = join(PROJECTS_DIR, name);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'project.json'), '{}\n');
}
