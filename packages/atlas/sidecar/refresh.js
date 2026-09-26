import { fork } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, posix, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, head, inHistory, READ_ONLY_ENV } from './git.js';
import { readSnapshot } from './map.js';

/**
 * atlas_refresh: the checkout mapped anew with this engine, in the
 * background, into a cache outside the repository. The map is made by a
 * child process, so the server keeps answering while it runs; each answer
 * given meanwhile uses the snapshot it started with and names it. A
 * finished map is built in a directory of its own and swapped in whole, by
 * one rename; nothing is ever written into the repository.
 */

const WORKER = fileURLToPath(new URL('./refresh-worker.js', import.meta.url));
// Snapshots kept per repository, newest first; older ones are removed.
const KEPT = 3;

/**
 * The directory the refreshes of every repository are cached under:
 * %LOCALAPPDATA%\atlas on Windows, else $XDG_CACHE_HOME/atlas when that is an
 * absolute path, else ~/.cache/atlas.
 *
 * @param {Record<string, string|undefined>} [env]
 * @param {string} [platform]
 * @param {string} [home]
 */
export function cacheRoot(env = process.env, platform = process.platform, home = homedir()) {
  if (platform === 'win32') return win32.join(env.LOCALAPPDATA || win32.join(home, 'AppData', 'Local'), 'atlas');
  const xdg = env.XDG_CACHE_HOME;
  if (xdg && posix.isAbsolute(xdg)) return posix.join(xdg, 'atlas');
  return posix.join(home, '.cache', 'atlas');
}

// Whether child is parent or under it. A path on another drive comes back
// from relative() absolute, so it is not.
function inside(child, parent) {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * What the checkout is, for whether a finished refresh still describes it:
 * HEAD and the bytes of every file that differs from HEAD.
 */
export function checkoutFingerprint(root) {
  const hash = createHash('sha256').update(head(root) ?? '');
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  for (const entry of String(status.stdout).split('\0').filter((line) => line.length >= 4).sort()) {
    hash.update(`\0${entry}`);
    try {
      hash.update(readFileSync(resolve(root, entry.slice(3))));
    } catch {
      hash.update('\0absent');
    }
  }
  return hash.digest('hex');
}

/**
 * The worker's environment: every git the engine runs there reads only, as
 * the sidecar's own do (sidecar/git.js). The engine calls git itself, so the
 * filesystem monitor is turned off through git's environment configuration,
 * appended after any the host already set.
 */
export function workerEnv(env) {
  const count = Number.parseInt(env.GIT_CONFIG_COUNT ?? '', 10);
  const at = Number.isInteger(count) && count > 0 ? count : 0;
  return {
    ...env,
    ...READ_ONLY_ENV,
    GIT_CONFIG_COUNT: String(at + 1),
    [`GIT_CONFIG_KEY_${at}`]: 'core.fsmonitor',
    [`GIT_CONFIG_VALUE_${at}`]: 'false',
  };
}

function forkWorker({ root, out, env }) {
  return fork(WORKER, [root, out], { env: workerEnv(env), stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
}

// A directory a killed or crashed server left behind: an unfinished map, or
// a snapshot moved aside and never removed. Another server may be making a
// map of the same repository at this moment, so only one a day old goes.
const LEFT_BEHIND = /\.[0-9a-f]{8}\.(tmp|old)$/;
const LEFT_BEHIND_AGE_MS = 24 * 60 * 60 * 1000;

// Removing a directory a killed process was writing can meet a handle not
// yet closed on Windows; a few short retries outlast it.
function remove(path) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Left for the next refresh of this repository to remove.
  }
}

/**
 * The refreshes of one server process, by repository.
 *
 * @param {{ spawnWorker?: Function, env?: Record<string, string|undefined>, now?: () => Date }} [options]
 *   spawnWorker is how a map is made in the background; it returns an
 *   object with on('message'), on('exit') and kill(), as a forked child does
 */
export function createRefresher({ spawnWorker = forkWorker, env = process.env, now = () => new Date() } = {}) {
  const runs = new Map();
  const finished = new Map();

  function keyOf(root) {
    return createHash('sha256').update(real(root)).digest('hex').slice(0, 16);
  }

  function place(root) {
    const base = cacheRoot(env);
    if (inside(real(base), real(root)) || inside(resolve(base), resolve(root))) {
      return { error: { code: 'ATLAS_SIDECAR_CACHE_INSIDE', details: [`the cache directory ${base} is inside the repository`], whatToDo: 'point LOCALAPPDATA or XDG_CACHE_HOME outside the repository' } };
    }
    return { dir: resolve(base, keyOf(root)) };
  }

  // The newest finished snapshots of a repository kept, older ones removed,
  // and what a server that stopped mid-map left behind.
  function prune(dir) {
    const entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const mine = new Set([...runs.values()].filter((run) => run.state === 'running').map((run) => run.out));
    for (const entry of entries.filter((item) => LEFT_BEHIND.test(item.name))) {
      const path = resolve(dir, entry.name);
      if (mine.has(path)) continue;
      let age = 0;
      try {
        age = now().getTime() - statSync(path).mtimeMs;
      } catch {
        continue;
      }
      if (age > LEFT_BEHIND_AGE_MS) remove(path);
    }
    const snapshots = entries
      .filter((entry) => /^[0-9a-f]{40}$/.test(entry.name))
      .map((entry) => {
        let meta = null;
        try {
          meta = JSON.parse(readFileSync(resolve(dir, entry.name, 'snapshot.json'), 'utf8'));
        } catch {
          meta = null;
        }
        return { name: entry.name, finishedAt: meta?.finishedAt ?? '' };
      })
      .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
    for (const stale of snapshots.slice(KEPT)) remove(resolve(dir, stale.name));
  }

  /**
   * Starts a refresh of the repository unless one is running, or the last
   * one finished on a checkout that has not changed since.
   */
  function start(root) {
    const key = keyOf(root);
    const running = runs.get(key);
    if (running && running.state === 'running') return { run: running, started: false };
    const fingerprint = checkoutFingerprint(root);
    const done = finished.get(key);
    if (done && done.fingerprint === fingerprint) return { run: done, started: false };
    // A map that failed on this very checkout would fail again; the failure
    // stands until the checkout changes.
    if (running?.state === 'failed' && running.fingerprint === fingerprint) return { run: running, started: false };
    const where = place(root);
    if (where.error) return { error: where.error };
    const commit = head(root);
    if (!commit) return { error: { code: 'ATLAS_SIDECAR_REFRESH_FAILED', details: ['the repository has no commit to map'], whatToDo: 'commit, then refresh' } };
    mkdirSync(where.dir, { recursive: true });
    const out = resolve(where.dir, `${commit}.${randomBytes(4).toString('hex')}.tmp`);
    const run = {
      state: 'running',
      root,
      key,
      head: commit,
      fingerprint,
      startedAt: now().toISOString(),
      phase: 'starting',
      out,
      dir: where.dir,
      lastDurationMs: done?.durationMs ?? null,
    };
    runs.set(key, run);
    const child = spawnWorker({ root, out, env });
    run.child = child;
    let failure = null;
    let said = '';
    child.on('message', (message) => {
      if (message?.progress) run.phase = String(message.progress);
      if (message?.error) failure = String(message.error);
    });
    // The tail of what the worker printed, for a failure it could not report.
    child.stderr?.on('data', (chunk) => {
      said = `${said}${chunk}`.slice(-2000);
    });
    child.on('exit', (code) => {
      delete run.child;
      const finishedAt = now();
      run.durationMs = finishedAt.getTime() - Date.parse(run.startedAt);
      if (code !== 0 || failure) {
        remove(out);
        const last = said.trim().split('\n').pop() ?? '';
        Object.assign(run, { state: 'failed', finishedAt: finishedAt.toISOString(), error: failure ?? `the map stopped with exit code ${code}${last ? `: ${last}` : ''}` });
        return;
      }
      try {
        swapIn(run, finishedAt);
      } catch (err) {
        remove(out);
        Object.assign(run, { state: 'failed', finishedAt: finishedAt.toISOString(), error: `the finished map could not be put in place: ${err.message}` });
      }
    });
    return { run, started: true };
  }

  // The finished map replaces the snapshot of its HEAD in one rename; the
  // snapshot it replaces is moved aside first and removed after.
  function swapIn(run, finishedAt) {
    const target = resolve(run.dir, run.head);
    const aside = `${target}.${randomBytes(4).toString('hex')}.old`;
    if (existsSync(target)) renameSync(target, aside);
    renameSync(run.out, target);
    remove(aside);
    const snapshot = readSnapshot(run.root, target, {
      id: `refresh:${run.head.slice(0, 12)}:${finishedAt.toISOString()}`,
      label: `the refresh of ${run.head.slice(0, 7)} at ${finishedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    });
    if (!snapshot.ok) throw new Error(snapshot.error.details.join('; '));
    Object.assign(run, { state: 'done', finishedAt: finishedAt.toISOString(), snapshotDir: target, snapshot: snapshot.snapshot });
    finished.set(run.key, run);
    prune(run.dir);
  }

  /**
   * The refreshed snapshot to answer from, when there is one this checkout's
   * history holds and the committed map is not newer than it.
   */
  function snapshotFor(root, committedCommit) {
    const done = finished.get(keyOf(root));
    if (!done?.snapshot) return null;
    if (!inHistory(root, done.head)) return null;
    if (committedCommit && committedCommit !== done.head && !git(root, ['merge-base', '--is-ancestor', committedCommit, done.head]).ok) return null;
    return done.snapshot;
  }

  function status(root) {
    return runs.get(keyOf(root)) ?? null;
  }

  // The host closed the server's input: a map still running is stopped, and
  // its unfinished directory removed once the worker has exited, so a write
  // it was making cannot land after the removal. A worker that does not exit
  // within two seconds is not waited for.
  async function stopAll() {
    const stopping = [...runs.values()].filter((run) => run.state === 'running' && run.child);
    await Promise.all(stopping.map((run) => new Promise((settle) => {
      const timer = setTimeout(settle, 2000);
      run.child.once('exit', () => {
        clearTimeout(timer);
        settle();
      });
      run.child.kill();
    })));
    for (const run of stopping) remove(run.out);
  }

  return { start, status, snapshotFor, stopAll, cacheDir: (root) => place(root).dir ?? null };
}
