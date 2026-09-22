import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/basic');

export const ALPHA = { name: 'alpha', globs: ['packages/alpha/**'], role: 'code', status: 'accepted' };
export const BETA = { name: 'beta', globs: ['packages/beta/**'], role: 'code', status: 'accepted' };
export const SHARED = {
  name: 'shared',
  globs: ['shared/**', 'packages/alpha/lib/**'],
  role: 'code',
  status: 'accepted',
};

/**
 * Copy the fixture into a temp git repo with one commit so `git ls-files` has a tree.
 * The caller deletes the returned path.
 */
export function makeFixtureRepo() {
  const root = mkdtempSync(resolve(tmpdir(), 'atlas-core-'));
  cpSync(FIXTURE, root, { recursive: true });
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) {
      rmSync(root, { recursive: true, force: true });
      throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
    }
  };
  git(['init']);
  git(['add', '-A']);
  git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'fixture']);
  return root;
}
