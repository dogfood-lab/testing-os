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

const READ_COMMANDS = new Set(['cat-file', 'diff', 'ls-files', 'ls-tree', 'merge-base', 'rev-list', 'rev-parse', 'show', 'status']);

/**
 * A ref git reads: a commit, a branch, a tag, HEAD~3, origin/main; never an
 * option. Every ref an asker passes is held to it before git sees it.
 */
export const REF_PATTERN = '^[A-Za-z0-9._/~^@{}][A-Za-z0-9._/~^@{}-]*$';
const REF = new RegExp(REF_PATTERN);

/** Whether text has the shape of a ref git may be given. */
export function isRefShaped(text) {
  return typeof text === 'string' && text.length > 0 && text.length <= 200 && REF.test(text);
}

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

/**
 * Whether commit is tip or an ancestor of it: by default HEAD, this
 * checkout's history; or the commit a ref names.
 */
export function inHistory(root, commit, tip = 'HEAD') {
  if (!/^[0-9a-f]{40}$/.test(String(commit))) return false;
  if (!git(root, ['cat-file', '-e', `${commit}^{commit}`]).ok) return false;
  return git(root, ['merge-base', '--is-ancestor', commit, tip]).ok;
}

/** The commit a ref names in this clone, or null when it names none. */
export function commitOf(root, ref) {
  if (!isRefShaped(ref)) return null;
  const result = git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]);
  return result.ok ? String(result.stdout).trim() : null;
}

/**
 * How far a commit is from this checkout's HEAD: the commits it holds that
 * the checkout does not (ahead) and those the checkout holds that it does
 * not (behind). Null when either side cannot be counted.
 *
 * @returns {{ ahead: number, behind: number } | null}
 */
export function distanceFromHead(root, commit) {
  const result = git(root, ['rev-list', '--left-right', '--count', `HEAD...${commit}`]);
  if (!result.ok) return null;
  const [behind, ahead] = String(result.stdout).trim().split(/\s+/).map(Number);
  return Number.isInteger(ahead) && Number.isInteger(behind) ? { ahead, behind } : null;
}

/**
 * The fetched upstream of this checkout, as this clone already holds it: the
 * current branch's upstream (@{u}), else the remote's default (origin/HEAD),
 * else none. Nothing is fetched, so it is as fresh as the last fetch.
 *
 * @returns {{ name: string, commit: string } | null}
 */
export function upstreamOf(root) {
  return upstreamsOf(root)[0] ?? null;
}

/** Each fetched upstream in that order, @{u} then origin/HEAD, the same ref once. */
export function upstreamsOf(root) {
  const out = [];
  for (const spec of ['@{u}', 'origin/HEAD']) {
    const named = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', spec]);
    const name = named.ok ? String(named.stdout).trim() : '';
    if (!name || !isRefShaped(name) || out.some((entry) => entry.name === name)) continue;
    const commit = commitOf(root, name);
    if (commit) out.push({ name, commit });
  }
  return out;
}

/** The id git keeps a file under at a commit or ref, or null when it holds none there. */
export function blobAt(root, rev, path) {
  const result = git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}:${path}`]);
  return result.ok ? String(result.stdout).trim() : null;
}

/**
 * The regular files a commit holds, as `git ls-files` lists a checkout's:
 * symlinks and submodules left out.
 *
 * @returns {string[] | null} null when git cannot list the commit
 */
export function trackedAt(root, commit) {
  const result = git(root, ['ls-tree', '-r', '-z', '--full-tree', commit]);
  if (!result.ok) return null;
  const out = [];
  for (const entry of String(result.stdout).split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const [mode, type] = entry.slice(0, tab).split(' ');
    if (type === 'blob' && mode !== '120000') out.push(entry.slice(tab + 1));
  }
  return out;
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
