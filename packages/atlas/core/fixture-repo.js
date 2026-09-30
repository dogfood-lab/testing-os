import { spawnSync } from 'node:child_process';
import { cpSync, lstatSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
export const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/basic');
export const LANGUAGES = resolve(REPO_ROOT, 'fixtures/atlas/languages');
export const RESOLVE_JS = resolve(REPO_ROOT, 'fixtures/atlas/resolve-js');
export const BUILD_OUTPUT = resolve(REPO_ROOT, 'fixtures/atlas/build-output');
export const PYTHON_SRC = resolve(REPO_ROOT, 'fixtures/atlas/python-src');
export const PYTHON_FLAT = resolve(REPO_ROOT, 'fixtures/atlas/python-flat');
export const DOORS = resolve(REPO_ROOT, 'fixtures/atlas/doors');
export const DOORS_PY = resolve(REPO_ROOT, 'fixtures/atlas/doors-py');
export const DOORS_TS = resolve(REPO_ROOT, 'fixtures/atlas/doors-ts');
export const SEQUENCE = resolve(REPO_ROOT, 'fixtures/atlas/sequence');

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

/**
 * This repository's tree at HEAD as a repository of its own in a temporary
 * directory: the tree committed once, mapped by the engine in this checkout,
 * and the map committed. The tree is read from HEAD's objects, so a shallow
 * clone serves it as well as a full one, and the history the map is checked
 * against is those two commits whatever depth the tests run at. The committed
 * atlas/ of HEAD is in the first commit, so it is the map that the second
 * replaces. This checkout is only read: the tree goes through a separate
 * index file, kept in the new repository's .git and removed once the files
 * are written. The caller removes the returned path.
 */
export function makeThisRepository({ prefix = 'atlas-this-' } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), prefix));
  const checked = (label, result) => {
    if (result.status !== 0) {
      rmSync(root, { recursive: true, force: true });
      throw new Error(`${label} failed: ${(result.stdout || '') + (result.stderr || String(result.error ?? ''))}`.trim());
    }
  };
  // This repository's tree and its map are megabytes, past spawnSync's default buffer.
  const git = (cwd, args, env = process.env) => checked(`git ${args.join(' ')}`,
    spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  git(root, ['init', '-q']);
  git(root, ['config', 'core.autocrlf', 'false']);
  const index = { ...process.env, GIT_INDEX_FILE: join(root, '.git', 'this-repository.index') };
  git(REPO_ROOT, ['read-tree', 'HEAD'], index);
  git(REPO_ROOT, ['-c', 'core.autocrlf=false', 'checkout-index', '-a', '-f', `--prefix=${root.replaceAll('\\', '/')}/`], index);
  rmSync(index.GIT_INDEX_FILE);
  const commit = (message) => {
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', message]);
  };
  commit('this repository at HEAD');
  checked('atlas map', spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  commit('map');
  return root;
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
