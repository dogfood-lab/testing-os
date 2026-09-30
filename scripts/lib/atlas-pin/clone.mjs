import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Git in one checkout. Every call names the checkout with -C, so the caller's
 * working directory never matters, and runs with the environment the tool was
 * given, so a test can take away the identity git would otherwise find.
 *
 * @param {string} root
 * @param {NodeJS.ProcessEnv} env
 * @returns {(args: string[], options?: object) => { status: number, stdout: string, stderr: string }}
 */
export function gitIn(root, env) {
  return (args, options = {}) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, ...options });
    return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? (result.error?.message || '') };
  };
}

/**
 * What git says about a checkout before anything is read from it: whether it
 * is the top of a checkout, the branch it is on, the branch its origin calls
 * the default, and whether its working tree is clean.
 */
export function cloneState(root, env) {
  const git = gitIn(root, env);
  const top = git(['rev-parse', '--show-cdup']);
  if (top.status !== 0 || top.stdout.trim() !== '') return { isClone: false };
  const current = git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const remote = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const status = git(['status', '--porcelain']);
  return {
    isClone: true,
    branch: current.status === 0 ? current.stdout.trim() : null,
    defaultBranch: remote.status === 0 ? remote.stdout.trim().replace(/^origin\//, '') : null,
    dirty: status.status !== 0 || status.stdout.trim() !== '',
  };
}

/**
 * The files at a ref, as git stores them. Reading the commit rather than the
 * disk means a CRLF checkout reads the same text as an LF one, and a branch
 * can be read without checking it out.
 *
 * @returns {{ paths: string[], read: (path: string) => string | null } | null} null when the ref names nothing
 */
export function treeAt(root, ref, env) {
  const git = gitIn(root, env);
  const listed = git(['ls-tree', '-r', '-z', '--full-tree', '--name-only', ref]);
  if (listed.status !== 0) return null;
  const paths = listed.stdout.split('\0').filter((path) => path !== '');
  return {
    paths,
    read(path) {
      const shown = git(['cat-file', 'blob', `${ref}:${path}`]);
      return shown.status === 0 ? shown.stdout : null;
    },
  };
}

/**
 * A clean clone of a checkout in a temporary directory, taken with
 * --no-local as a fresh clone from the host would be, into a directory with
 * the checkout's own name and with its origin's URL, so a map made there names
 * the repository as a map made in the checkout would. LFS files stay pointers,
 * as CI's checkout leaves them.
 *
 * @param {string} root
 * @param {{ branch?: string | null, env: NodeJS.ProcessEnv }} options
 * @returns {{ ok: true, dir: string, remove: () => void } | { ok: false, output: string }}
 */
export function temporaryClone(root, { branch = null, env }) {
  const parent = mkdtempSync(join(tmpdir(), 'atlas-pin-bump-'));
  const remove = () => rmSync(parent, { recursive: true, force: true });
  const dir = join(parent, basename(resolve(root)));
  const cloned = spawnSync('git', ['clone', '-q', '--no-local', ...(branch ? ['--branch', branch] : []), '--', resolve(root), dir], {
    encoding: 'utf8',
    env: { ...env, GIT_LFS_SKIP_SMUDGE: '1' },
  });
  if (cloned.status !== 0) {
    remove();
    return { ok: false, output: `${cloned.stderr ?? ''}${cloned.error?.message ?? ''}`.trim() };
  }
  const origin = gitIn(root, env)(['remote', 'get-url', 'origin']);
  if (origin.status === 0) gitIn(dir, env)(['remote', 'set-url', 'origin', origin.stdout.trim()]);
  return { ok: true, dir, remove };
}
