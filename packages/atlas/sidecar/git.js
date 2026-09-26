import { spawnSync } from 'node:child_process';

/**
 * The only way the sidecar runs git. It reads and never writes: each call is
 * one of the read commands below, with GIT_OPTIONAL_LOCKS=0 so a status or a
 * diff does not refresh .git/index behind the caller's back (the fleet
 * service learned that on a mounted checkout), and with the filesystem
 * monitor off so no daemon is started and no cookie file is written under
 * .git. In a partial clone git would fetch a missing object from the remote
 * to answer a read; GIT_NO_LAZY_FETCH stops that, since the sidecar never
 * uses the network. A command outside the list throws: a write here is a
 * defect, not an option.
 */

const READ_COMMANDS = new Set(['cat-file', 'diff', 'ls-files', 'merge-base', 'rev-parse', 'show', 'status']);

// A map is a few megabytes on a large repository, and git show returns it whole.
const MAX_BUFFER = 64 * 1024 * 1024;

export const READ_ONLY_ENV = Object.freeze({ GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' });

/**
 * @param {string} cwd
 * @param {string[]} args the subcommand first
 * @param {{ encoding?: 'utf8' | 'buffer', input?: string }} [options]
 * @returns {{ ok: boolean, status: number|null, stdout: string|Buffer, stderr: string }}
 */
export function git(cwd, args, { encoding = 'utf8', input } = {}) {
  if (!READ_COMMANDS.has(args[0])) throw new Error(`atlas sidecar: git ${args[0]} is not a read command`);
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd,
    encoding: encoding === 'buffer' ? 'buffer' : 'utf8',
    env: { ...process.env, ...READ_ONLY_ENV },
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    // As bytes: spawnSync would read a string through the output encoding.
    ...(input == null ? {} : { input: Buffer.from(input, 'utf8') }),
  });
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr ?? '');
  return { ok: result.status === 0, status: result.status, stdout: result.stdout ?? '', stderr };
}

/** The top of the working tree that holds dir, or null when dir is in none. */
export function topLevel(dir) {
  let result;
  try {
    result = git(dir, ['rev-parse', '--show-toplevel']);
  } catch {
    return null;
  }
  return result.ok ? String(result.stdout).trim() : null;
}

/** The commit HEAD names, or null in a repository with no commit yet. */
export function head(root) {
  const result = git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  return result.ok ? String(result.stdout).trim() : null;
}

/** Whether commit is HEAD or an ancestor of it in this checkout's history. */
export function inHistory(root, commit) {
  if (!/^[0-9a-f]{40}$/.test(String(commit))) return false;
  if (!git(root, ['cat-file', '-e', `${commit}^{commit}`]).ok) return false;
  return git(root, ['merge-base', '--is-ancestor', commit, 'HEAD']).ok;
}

/**
 * The bytes of files at a commit, read in one git process: a map from each
 * path to its content, a path the commit does not hold left out.
 *
 * @param {string} root
 * @param {string} commit
 * @param {string[]} paths
 * @returns {Map<string, Buffer>}
 */
export function filesAt(root, commit, paths) {
  const out = new Map();
  if (paths.length === 0) return out;
  const result = git(root, ['cat-file', '--batch'], { encoding: 'buffer', input: paths.map((path) => `${commit}:${path}`).join('\n') + '\n' });
  if (!result.ok) return out;
  const bytes = result.stdout;
  let at = 0;
  for (const path of paths) {
    const end = bytes.indexOf(0x0a, at);
    if (end === -1) break;
    const header = bytes.subarray(at, end).toString('utf8');
    at = end + 1;
    // "<object> <type> <size>" then the content and a newline; "<name>
    // missing" alone when the commit holds no such path.
    const match = /^[0-9a-f]+ (\w+) (\d+)$/.exec(header);
    if (!match) continue;
    const size = Number(match[2]);
    if (match[1] === 'blob') out.set(path, bytes.subarray(at, at + size));
    at += size + 1;
  }
  return out;
}

/** Whether the clone holds only part of its history (a shallow clone). */
export function isShallow(root) {
  const result = git(root, ['rev-parse', '--is-shallow-repository']);
  return result.ok && String(result.stdout).trim() === 'true';
}
