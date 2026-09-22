import { spawnSync } from 'node:child_process';
import { cpSync, lstatSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/basic');
export const LANGUAGES = resolve(REPO_ROOT, 'fixtures/atlas/languages');
export const RESOLVE_JS = resolve(REPO_ROOT, 'fixtures/atlas/resolve-js');
export const BUILD_OUTPUT = resolve(REPO_ROOT, 'fixtures/atlas/build-output');
export const PYTHON_SRC = resolve(REPO_ROOT, 'fixtures/atlas/python-src');
export const PYTHON_FLAT = resolve(REPO_ROOT, 'fixtures/atlas/python-flat');

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
  return makeRepo(FIXTURE);
}

export function makeRepo(fixture) {
  const root = mkdtempSync(resolve(tmpdir(), 'atlas-core-'));
  cpSync(fixture, root, { recursive: true });
  // Keep linked.md a relative symlink in the temp repo. Windows checkout
  // with core.symlinks false materializes the committed link as a regular
  // file, and copying a symlink there rewrites a relative target to an
  // absolute path. Either one would hash it, or record a machine path.
  const link = join(root, 'linked.md');
  let linkInfo = null;
  try {
    linkInfo = lstatSync(link);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (linkInfo) {
    rmSync(link);
    symlinkSync('README.md', link);
  }
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
