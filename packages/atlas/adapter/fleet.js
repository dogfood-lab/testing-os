/**
 * Rendering a fleet of repositories: one render of one repository, the
 * history the page's delta strip draws, and the state and fleet files, shared
 * by the weekly job (scripts/atlas-render.mjs, which lists public GitHub
 * repositories and publishes to a branch) and the container service below
 * (which reads a list from /data/fleet.yml and keeps everything on /data).
 *
 * A render always maps a working tree this module owns: a scratch clone, or
 * the service's persistent clone. A checkout the operator mounted is read,
 * cloned from and never written.
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { writeArtifactSync } from './write.js';

// All three waits are used, so a transport failure is four attempts. The 60s wait is not dropped.
export const BACKOFF_MS = [5_000, 20_000, 60_000];
export const REPO_BUDGET_MS = 90_000;
export const WINDOW_DAYS = 180;
// A year of weekly renders, which is what the page's delta strip draws.
export const HISTORY_CAP = 52;
export const RENDER_FILES = ['structure.json', 'statistics.json', 'README.md', 'page.json'];
export const DEFAULT_SCHEDULE = '0 6 * * 1';
export const DEFAULT_PORT = 8080;
const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
// A clone whose newest commit is older than the window selects nothing; git
// says so in these words, and one commit is then the honest tree to map.
const EMPTY_WINDOW = /no commits selected for shallow requests/;

export function shallowSinceDate(now, days = WINDOW_DAYS) {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() - days - 1);
  return date.toISOString().slice(0, 10);
}

export function earlierWindow(text, now, defaultDays = WINDOW_DAYS) {
  let doc;
  try {
    doc = parse(String(text));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object') return null;
  const window = doc.window;
  const fallback = shallowSinceDate(now, defaultDays);
  let requested = null;
  if (typeof window === 'number' && Number.isFinite(window) && window > defaultDays) {
    requested = shallowSinceDate(now, window);
  } else if (window instanceof Date && !Number.isNaN(window.getTime())) {
    const pinned = new Date(window.getTime());
    pinned.setUTCDate(pinned.getUTCDate() - 1);
    requested = pinned.toISOString().slice(0, 10);
  } else if (typeof window === 'string' && window.trim()) {
    const pinned = new Date(window.trim());
    if (Number.isNaN(pinned.getTime())) return null;
    pinned.setUTCDate(pinned.getUTCDate() - 1);
    requested = pinned.toISOString().slice(0, 10);
  }
  if (!requested || requested >= fallback) return null;
  return requested;
}

// A clone URL may carry a token in its user part. Nothing that is logged or
// kept in state may repeat it.
export function redact(text) {
  return String(text ?? '').replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1***@');
}

function stderrOf(result) {
  return redact((result?.stderr || result?.stdout || '').trim()).slice(0, 200);
}

export function commandReason(label, result) {
  const detail = stderrOf(result);
  return detail ? `${label} ${detail}` : label;
}

export function unauthenticatedGitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
  };
}

export function headSha(stdout) {
  const line = String(stdout ?? '').split(/\r?\n/).find((entry) => /^[0-9a-f]{40}\s/i.test(entry.trim()) || /^[0-9a-f]{40}$/i.test(entry.trim()));
  const sha = line ? line.trim().split(/\s+/)[0] : '';
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}

export function defaultRun(command, args, opts = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = opts.timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, opts.timeoutMs) : null;
    child.on('close', (status) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ status: timedOut ? 124 : (status ?? 1), stdout, stderr, timedOut });
    });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ status: 1, stdout, stderr: error.message });
    });
  });
}

function budgetLeft(timeoutMs) {
  return typeof timeoutMs === 'function' ? timeoutMs() : timeoutMs;
}

/**
 * A shallow clone of the window, retried on transport failure with the
 * backoff schedule. A repository with no commit in the window is cloned at
 * depth 1 instead of failing: its map is real, its history in the window is empty.
 */
export async function cloneWithBackoff({ run, sleep, url, branch = null, dest, timeoutMs, since, env = unauthenticatedGitEnv() }) {
  const pick = branch ? ['--branch', branch] : [];
  let args = ['clone', '--shallow-since', since, '--single-branch', ...pick, url, dest];
  const once = async () => {
    const left = budgetLeft(timeoutMs);
    if (left <= 0) return { status: 1, stdout: '', stderr: 'budget', budget: true };
    let result = await run('git', args, { timeoutMs: left, env });
    if (result.status !== 0 && EMPTY_WINDOW.test(result.stderr ?? '')) {
      args = ['clone', '--depth', '1', '--single-branch', ...pick, url, dest];
      rmSync(dest, { recursive: true, force: true });
      result = await run('git', args, { timeoutMs: Math.max(1, budgetLeft(timeoutMs)), env });
    }
    return result;
  };
  let result = await once();
  if (result.status === 0 || result.budget || result.timedOut) return result;
  for (const wait of BACKOFF_MS) {
    const left = budgetLeft(timeoutMs);
    if (left <= 0) return { status: 1, stdout: '', stderr: 'budget', budget: true };
    await sleep(Math.min(wait, left));
    rmSync(dest, { recursive: true, force: true });
    result = await once();
    if (result.status === 0 || result.budget || result.timedOut) return result;
  }
  return result;
}

export function fleetEntry(fullName, commit, renderedAt, now, structure, statistics, envelope) {
  const boundaries = structure?.boundaries ?? [];
  const doors = (structure?.doors ?? []).length;
  const unresolved = boundaries.reduce((sum, boundary) => sum + (boundary.unresolvedSites ?? 0), 0);
  const openDivergence = (envelope?.rows ?? []).filter((row) => row.state === 'open').length;
  const ageDays = Math.max(0, Math.floor((now.getTime() - Date.parse(renderedAt)) / 86_400_000));
  return {
    repo: fullName,
    commit,
    renderedAt,
    ageDays,
    boundaries: boundaries.length,
    doors,
    unresolved,
    openDivergence,
    confidence: statistics?.confidence?.level ?? 'low',
  };
}

/**
 * How many structural changes a page's `changes` names. A line "And 3 more
 * changes to a door." stands for the three it cut, and the closing line of
 * file counts is not a change to the structure.
 */
export function changeCount(changes) {
  if (!changes || typeof changes !== 'object' || changes.first || changes.unchanged) return 0;
  const items = Array.isArray(changes.items) ? changes.items : [];
  return items.filter((item) => item && typeof item === 'object' && item.kind !== 'counts').reduce((sum, item) => {
    const more = /^And (\d+) more /.exec(String(item.sentence ?? ''));
    return sum + (more ? Number(more[1]) : 1);
  }, 0);
}

/** One render as the page's delta strip draws it. */
export function historyEntry(page, commit, renderedAt) {
  const changes = page?.changes && typeof page.changes === 'object' ? page.changes : null;
  const headline = (changes?.items ?? []).find((item) => item && typeof item === 'object' && item.kind !== 'counts');
  let headlineKind = 'unchanged';
  if (changes?.first) headlineKind = 'first';
  else if (!changes?.unchanged && headline) headlineKind = String(headline.kind);
  return {
    renderedAt,
    commit,
    itemCount: changeCount(changes),
    headlineKind,
    fileCounts: changes?.fileCounts ?? null,
  };
}

/**
 * The history with one render appended, oldest first, keeping the newest
 * HISTORY_CAP. history.json is an object rather than a bare list because the
 * site refuses a top-level array as an unexpected shape.
 */
export function appendHistory(previous, entry, cap = HISTORY_CAP) {
  const entries = Array.isArray(previous?.entries)
    ? previous.entries.filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    : [];
  return { entries: [...entries, entry].slice(-cap) };
}

/**
 * Why a repository at this head is not rendered again, or null when it is.
 * A render made before the page existed left no README.md, and its fleet row
 * counts no doors, so it renders again for the link to land.
 */
export function skipReason(known, sha, previousRow) {
  if (!known || known.commit !== sha) return null;
  if (known.notMapped) return 'not-mapped';
  return typeof previousRow?.doors === 'number' ? 'unchanged' : null;
}

/**
 * The fleet after a run: every earlier row still kept, its age refreshed,
 * then this run's renders over them, sorted by name.
 */
export function mergeFleet(previousRows, renderedNow, keep, now) {
  const ageDays = (renderedAt) => Math.max(0, Math.floor((now.getTime() - Date.parse(renderedAt)) / 86_400_000));
  const byRepo = new Map();
  for (const entry of previousRows ?? []) {
    if (!entry || typeof entry.repo !== 'string' || !keep(entry.repo)) continue;
    byRepo.set(entry.repo, { ...entry, ageDays: ageDays(entry.renderedAt) });
  }
  for (const entry of renderedNow) byRepo.set(entry.repo, entry);
  return [...byRepo.values()].sort((a, b) => a.repo.localeCompare(b.repo));
}

export function stateFrom(previous) {
  return {
    rendered: { ...(previous?.rendered ?? {}) },
    failures: { ...(previous?.failures ?? {}) },
  };
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * One render of one repository into outRoot/<owner>/<repo>/.
 *
 * `checkout({ remaining, since })` prepares the working tree and returns the
 * git result with `dir`, and `dispose` when the tree is scratch. `previous`
 * reads the last render's divergence (JSON or null) and history (a document,
 * null for none yet, or undefined when it exists but cannot be read, which
 * keeps it rather than restarting a year of entries from one). With
 * `propose`, a repository with no boundary file is mapped from atlas init's
 * proposal, written into the owned tree only. With `name`, the map is told the
 * repository's name, since a clone of a local path has no origin that says it.
 * `baseline` is the last render's directory, which the page compares against
 * when the tree holds no committed map.
 */
export async function renderOne({
  run, fullName, sha, now, state, outRoot, log, checkout, previous,
  cli = CLI, propose = false, name = false, baseline = null, budgetMs = REPO_BUDGET_MS,
}) {
  const started = Date.now();
  const remaining = () => budgetMs - (Date.now() - started);
  const scratch = mkdtempSync(join(tmpdir(), 'atlas-prev-'));
  const out = join(outRoot, ...fullName.split('/'));
  const abandon = (reason) => {
    state.failures[fullName] = { commit: sha, at: now.toISOString(), reason: redact(reason) };
    rmSync(out, { recursive: true, force: true });
    log(`failure ${fullName} ${redact(reason)}`);
    return { kind: 'failure' };
  };
  let tree = null;
  try {
    if (remaining() <= 0) return abandon('budget');
    tree = await checkout({ remaining, since: shallowSinceDate(now) });
    if (tree.budget || tree.timedOut) return abandon('budget');
    if (tree.status !== 0) return abandon(commandReason('clone', tree));
    const dest = tree.dir;
    const boundaryPath = join(dest, 'atlas', 'boundaries.yaml');
    let proposed = false;
    if (!existsSync(boundaryPath)) {
      if (!propose) {
        state.rendered[fullName] = { commit: sha, renderedAt: now.toISOString(), notMapped: true };
        delete state.failures[fullName];
        log(`not-mapped ${fullName}`);
        return { kind: 'not-mapped' };
      }
      const init = await run(process.execPath, [cli, 'init'], { cwd: dest, timeoutMs: Math.max(1, remaining()) });
      if (init?.timedOut) return abandon('budget');
      if (!init || init.status !== 0) return abandon(commandReason('init', init));
      proposed = true;
    }
    const earlier = earlierWindow(readFileSync(boundaryPath, 'utf8'), now);
    if (earlier) {
      const fetched = await run('git', ['fetch', '--shallow-since', earlier, 'origin'], {
        cwd: dest,
        timeoutMs: Math.max(1, remaining()),
        env: tree.env ?? unauthenticatedGitEnv(),
      });
      if (fetched?.timedOut || fetched?.budget) return abandon('budget');
      if (!fetched || fetched.status !== 0) return abandon(commandReason('clone', fetched));
    }
    // A tree with no statistics of its own continues the last render's, so
    // the cohesion high-water marks carry from one render to the next.
    const priorStatistics = baseline ? join(baseline, 'statistics.json') : null;
    if (priorStatistics && existsSync(priorStatistics) && !existsSync(join(dest, 'atlas', 'statistics.json'))) {
      cpSync(priorStatistics, join(dest, 'atlas', 'statistics.json'));
    }
    mkdirSync(out, { recursive: true });
    const previousJson = await previous.divergence();
    const previousPath = join(scratch, 'previous.json');
    const divergencePath = join(out, 'divergence.json');
    const args = [cli, 'map', '--divergence', divergencePath];
    if (name) args.push('--name', fullName);
    if (baseline && existsSync(join(baseline, 'structure.json'))) args.push('--baseline', baseline);
    if (previousJson) {
      writeArtifactSync(previousPath, JSON.stringify(previousJson));
      args.push('--previous', previousPath);
    }
    let mapped;
    try {
      mapped = await run(process.execPath, args, { cwd: dest, timeoutMs: Math.max(1, remaining()) });
    } catch (error) {
      return abandon(error.message || 'map');
    }
    if (mapped?.timedOut) return abandon('budget');
    if (!mapped || mapped.status !== 0) {
      const reason = (mapped?.stderr || mapped?.stdout || 'map').trim().slice(0, 200) || 'map';
      return abandon(reason);
    }
    if (remaining() <= 0) return abandon('budget');
    for (const file of RENDER_FILES) cpSync(join(dest, 'atlas', file), join(out, file));
    const renderedAt = now.toISOString();
    state.rendered[fullName] = { commit: sha, renderedAt, ...(proposed ? { proposed: true } : {}) };
    delete state.failures[fullName];
    const structure = JSON.parse(readFileSync(join(out, 'structure.json'), 'utf8'));
    const statistics = JSON.parse(readFileSync(join(out, 'statistics.json'), 'utf8'));
    const envelope = JSON.parse(readFileSync(divergencePath, 'utf8'));
    const page = readJsonFile(join(out, 'page.json'));
    const history = page ? await previous.history() : undefined;
    const historyWritten = history !== undefined;
    if (historyWritten) {
      const next = appendHistory(history, historyEntry(page, sha, renderedAt));
      writeArtifactSync(join(out, 'history.json'), `${JSON.stringify(next, null, 2)}\n`);
    } else {
      log(`history ${fullName} kept: ${page ? 'the previous history' : 'page.json'} could not be read`);
    }
    log(proposed ? `render ${fullName} proposed` : `render ${fullName}`);
    const entry = fleetEntry(fullName, sha, renderedAt, now, structure, statistics, envelope);
    if (proposed) entry.proposed = true;
    return { kind: 'rendered', entry, envelope, previous: previousJson, historyWritten };
  } finally {
    try { tree?.dispose?.(); } catch { /* a locked clone is scratch, not a render failure */ }
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* same */ }
  }
}

// ---------------------------------------------------------------------------
// The container service.

/**
 * The fleet file, validated. Each repository is a mounted checkout (`path`)
 * or a clone URL (`url`), with an optional `name` and, for a URL, `branch`.
 */
export function readFleetConfig(text) {
  let doc;
  try {
    doc = parse(String(text));
  } catch {
    throw new Error('fleet.yml is not valid YAML');
  }
  if (doc == null) doc = {};
  if (typeof doc !== 'object' || Array.isArray(doc)) throw new Error('fleet.yml must be a mapping');
  for (const key of Object.keys(doc)) {
    if (!['schedule', 'port', 'repositories'].includes(key)) throw new Error(`fleet.yml: unknown field ${key}`);
  }
  const schedule = doc.schedule == null ? DEFAULT_SCHEDULE : String(doc.schedule);
  parseCron(schedule);
  const port = doc.port == null ? DEFAULT_PORT : doc.port;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('fleet.yml: port must be a whole number from 1 to 65535');
  const list = doc.repositories ?? [];
  if (!Array.isArray(list)) throw new Error('fleet.yml: repositories must be a list');
  const repositories = list.map((entry, index) => {
    const where = `fleet.yml: repositories[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${where} must be a mapping`);
    for (const key of Object.keys(entry)) {
      if (!['path', 'url', 'name', 'branch'].includes(key)) throw new Error(`${where}.${key} is not a repository field`);
    }
    const hasPath = typeof entry.path === 'string' && entry.path.trim() !== '';
    const hasUrl = typeof entry.url === 'string' && entry.url.trim() !== '';
    if (hasPath === hasUrl) throw new Error(`${where} needs exactly one of path or url`);
    if (hasPath && !isAbsolute(entry.path)) throw new Error(`${where}.path must be absolute`);
    if (entry.name != null && !validName(entry.name)) throw new Error(`${where}.name must be owner/repo`);
    if (entry.branch != null && (hasPath || typeof entry.branch !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(entry.branch))) {
      throw new Error(`${where}.branch is a branch name, and only for a url`);
    }
    return hasPath
      ? { path: entry.path, name: entry.name ?? null }
      : { url: entry.url.trim(), name: entry.name ?? (nameFromUrl(entry.url) || null), branch: entry.branch ?? null };
  });
  const seen = new Set();
  for (const entry of repositories) {
    if (entry.url && !entry.name) throw new Error(`fleet.yml: cannot name ${redact(entry.url)}; give it a name: owner/repo`);
    if (entry.name && seen.has(entry.name)) throw new Error(`fleet.yml: ${entry.name} is listed twice`);
    if (entry.name) seen.add(entry.name);
  }
  return { schedule, port, repositories };
}

function validName(value) {
  return typeof value === 'string' && REPO_NAME.test(value) && value.split('/').every((part) => !/^\.+$/.test(part));
}

/** owner/repo from the last two path segments of a clone URL or scp-style address, or null. */
export function nameFromUrl(url) {
  const text = String(url ?? '').trim();
  let path;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      path = new URL(text).pathname;
    } catch {
      return null;
    }
  } else {
    const scp = /^[^/:]+:(.*)$/.exec(text);
    path = scp ? scp[1] : text;
  }
  const parts = path.replace(/\/+$/, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const candidate = `${parts.at(-2)}/${parts.at(-1)}`;
  return validName(candidate) ? candidate : null;
}

function serviceGitEnv() {
  // The operator's own git credentials, if the container was given any, are
  // what a private fleet clones with. Nothing may stop for a prompt.
  return { ...process.env, GIT_TERMINAL_PROMPT: '0' };
}

const CRON_FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
];

/** A five-field cron expression, in UTC, as sets of the values each field allows. */
export function parseCron(expr) {
  const fields = String(expr).trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`schedule must be five cron fields: ${expr}`);
  const sets = fields.map((field, index) => {
    const { name, min, max } = CRON_FIELDS[index];
    const values = new Set();
    for (const part of field.split(',')) {
      const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
      if (!match) throw new Error(`schedule: ${name} ${part} is not a cron value`);
      const step = match[2] == null ? 1 : Number(match[2]);
      let low = min;
      let high = max;
      if (match[1] !== '*') {
        const [a, b] = match[1].split('-').map(Number);
        low = a;
        high = b ?? (match[2] == null ? a : max);
      }
      if (step < 1 || low < min || high > max || low > high) throw new Error(`schedule: ${name} ${part} is out of range`);
      for (let value = low; value <= high; value += step) values.add(index === 4 && value === 7 ? 0 : value);
    }
    return values;
  });
  return {
    minute: sets[0], hour: sets[1], dom: sets[2], month: sets[3], dow: sets[4],
    domAny: fields[2] === '*', dowAny: fields[4] === '*',
  };
}

/** The first minute strictly after `after` that the schedule names, in UTC. */
export function nextRun(schedule, after) {
  const cron = typeof schedule === 'string' ? parseCron(schedule) : schedule;
  const t = new Date(after.getTime());
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);
  // Cron's rule: with both day fields restricted, either one matching is enough.
  const dayMatches = () => {
    const dom = cron.dom.has(t.getUTCDate());
    const dow = cron.dow.has(t.getUTCDay());
    if (cron.domAny && cron.dowAny) return true;
    if (cron.domAny) return dow;
    if (cron.dowAny) return dom;
    return dom || dow;
  };
  for (let guard = 0; guard < 200_000; guard += 1) {
    if (!cron.month.has(t.getUTCMonth() + 1)) {
      t.setUTCMonth(t.getUTCMonth() + 1, 1);
      t.setUTCHours(0, 0, 0, 0);
    } else if (!dayMatches()) {
      t.setUTCDate(t.getUTCDate() + 1);
      t.setUTCHours(0, 0, 0, 0);
    } else if (!cron.hour.has(t.getUTCHours())) {
      t.setUTCHours(t.getUTCHours() + 1, 0, 0, 0);
    } else if (!cron.minute.has(t.getUTCMinutes())) {
      t.setUTCMinutes(t.getUTCMinutes() + 1, 0, 0);
    } else {
      return t;
    }
  }
  throw new Error('schedule names no time that can occur');
}

function atlasDirOf(dataDir) {
  return join(dataDir, 'atlas');
}

/** True when /data holds no state yet, which is when the service maps at once. */
export function isFirstStart(dataDir) {
  return !existsSync(join(atlasDirOf(dataDir), 'state.json'));
}

// state.json and fleet.json are read by the server while a run writes them,
// so each lands whole or not at all.
function writeJsonAtomic(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeArtifactSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function resolveEntry(run, entry) {
  const env = serviceGitEnv();
  if (entry.path) {
    const found = await run('git', ['rev-parse', 'HEAD'], { cwd: entry.path, env });
    const sha = found?.status === 0 ? headSha(found.stdout) : null;
    if (!sha) return { name: entry.name ?? localName(entry.path), error: commandReason('head', found) };
    let name = entry.name;
    if (!name) {
      const origin = await run('git', ['remote', 'get-url', 'origin'], { cwd: entry.path, env });
      name = (origin?.status === 0 && nameFromUrl(origin.stdout.trim())) || localName(entry.path);
    }
    return { name, sha };
  }
  const args = entry.branch
    ? ['ls-remote', '--heads', entry.url, entry.branch]
    : ['ls-remote', '--symref', entry.url, 'HEAD'];
  const found = await run('git', args, { env });
  const sha = found?.status === 0 ? headSha(found.stdout) : null;
  if (!sha) return { name: entry.name, error: commandReason('head', found) };
  let branch = entry.branch;
  if (!branch) {
    const symref = /^ref:\s+refs\/heads\/(\S+)\s+HEAD/m.exec(found.stdout);
    branch = symref ? symref[1] : null;
  }
  return { name: entry.name, sha, branch };
}

function localName(path) {
  const base = basename(resolve(path)).replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+$/, 'repository');
  return `local/${base || 'repository'}`;
}

// A mounted checkout is cloned from, never mapped in place: the clone is
// scratch and takes the map, init's proposal and git's own writes.
function mountedCheckout({ run, sleep, entry, workRoot }) {
  return async ({ remaining, since }) => {
    const dir = mkdtempSync(join(workRoot, 'mounted-'));
    const env = serviceGitEnv();
    const result = await cloneWithBackoff({
      run, sleep, url: pathToFileURL(resolve(entry.path)).href, dest: dir, timeoutMs: remaining, since, env,
    });
    return { ...result, dir, env, dispose: () => rmSync(dir, { recursive: true, force: true }) };
  };
}

// A URL is cloned once into /data/clones/<owner>/<repo> and fetched on every
// later run. The clone is the service's own, so it is reset and cleaned
// before each map; one that will not fetch is cloned again.
function persistentCheckout({ run, sleep, entry, branch, dir }) {
  return async ({ remaining, since }) => {
    const env = serviceGitEnv();
    const opts = () => ({ cwd: dir, env, timeoutMs: Math.max(1, remaining()) });
    if (existsSync(join(dir, '.git'))) {
      let fetched = await run('git', ['fetch', '--shallow-since', since, 'origin'], opts());
      if (fetched.status !== 0 && EMPTY_WINDOW.test(fetched.stderr ?? '')) {
        fetched = await run('git', ['fetch', '--depth', '1', 'origin'], opts());
      }
      if (fetched.timedOut) return { ...fetched, dir, env };
      if (fetched.status === 0) {
        const ref = branch ? `refs/remotes/origin/${branch}` : 'FETCH_HEAD';
        const moved = await run('git', ['checkout', '--force', '--detach', ref], opts());
        const cleaned = moved.status === 0 ? await run('git', ['clean', '-ffdxq'], opts()) : moved;
        if (cleaned.status === 0) return { ...cleaned, dir, env };
      }
      rmSync(dir, { recursive: true, force: true });
    }
    mkdirSync(join(dir, '..'), { recursive: true });
    const cloned = await cloneWithBackoff({ run, sleep, url: entry.url, branch, dest: dir, timeoutMs: remaining, since, env });
    return { ...cloned, dir, env };
  };
}

function previousFrom(repoDir) {
  return {
    async divergence() {
      return readJsonFile(join(repoDir, 'divergence.json'));
    },
    async history() {
      const path = join(repoDir, 'history.json');
      if (!existsSync(path)) return null;
      const doc = readJsonFile(path);
      if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.entries)) return undefined;
      return doc;
    },
  };
}

/**
 * One run of the service over every repository in the fleet file. Each
 * render lands under /data/atlas/<owner>/<repo>/ as it finishes; state.json
 * and fleet.json are written last, in the weekly job's shapes.
 */
export async function runFleetOnce({
  dataDir, config, run = defaultRun, sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  now = new Date(), log = (line) => process.stdout.write(`${line}\n`), cli = CLI, budgetMs = REPO_BUDGET_MS,
}) {
  const atlasDir = atlasDirOf(dataDir);
  mkdirSync(atlasDir, { recursive: true });
  const workRoot = join(dataDir, 'work');
  rmSync(workRoot, { recursive: true, force: true });
  mkdirSync(workRoot, { recursive: true });
  const state = stateFrom(readJsonFile(join(atlasDir, 'state.json')));
  const previousFleet = readJsonFile(join(atlasDir, 'fleet.json'));
  const listed = new Set();
  const renderedNow = [];
  try {
    for (const entry of config.repositories) {
      const head = await resolveEntry(run, entry);
      if (listed.has(head.name)) {
        log(`failure ${head.name} listed twice in fleet.yml; the second is not mapped`);
        continue;
      }
      listed.add(head.name);
      if (head.error) {
        state.failures[head.name] = { commit: null, at: now.toISOString(), reason: head.error };
        log(`failure ${head.name} ${head.error}`);
        continue;
      }
      const before = (previousFleet?.repositories ?? []).find((row) => row?.repo === head.name);
      const skip = skipReason(state.rendered[head.name], head.sha, before);
      if (skip) {
        log(`skip ${head.name} ${skip}`);
        continue;
      }
      const repoDir = join(atlasDir, ...head.name.split('/'));
      const outRoot = mkdtempSync(join(workRoot, 'out-'));
      const checkout = entry.path
        ? mountedCheckout({ run, sleep, entry, workRoot })
        : persistentCheckout({ run, sleep, entry, branch: head.branch, dir: join(dataDir, 'clones', ...head.name.split('/')) });
      let result;
      try {
        result = await renderOne({
          run, fullName: head.name, sha: head.sha, now, state, outRoot, log, checkout,
          previous: previousFrom(repoDir), cli, propose: true, name: true,
          baseline: existsSync(join(repoDir, 'structure.json')) ? repoDir : null, budgetMs,
        });
      } catch (error) {
        state.failures[head.name] = { commit: head.sha, at: now.toISOString(), reason: redact(error.message || 'map') };
        log(`failure ${head.name} ${redact(error.message || 'map')}`);
        continue;
      }
      if (result.kind !== 'rendered') continue;
      mkdirSync(repoDir, { recursive: true });
      cpSync(join(outRoot, ...head.name.split('/')), repoDir, { recursive: true });
      renderedNow.push(result.entry);
    }
    for (const bucket of [state.rendered, state.failures]) {
      for (const name of Object.keys(bucket)) if (!listed.has(name)) delete bucket[name];
    }
    const fleet = {
      generatedAt: now.toISOString(),
      repositories: mergeFleet(previousFleet?.repositories, renderedNow, (name) => listed.has(name), now),
    };
    writeJsonAtomic(join(atlasDir, 'state.json'), state);
    writeJsonAtomic(join(atlasDir, 'fleet.json'), fleet);
    return { state, fleet };
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webp': 'image/webp',
};
const ASSETS = new Set(['render.js', 'hero.webp']);
// The page reads its data from CONFIG.atlasBase + "indexes/atlas/…"; the same
// files are also at /atlas/…, the shorter address for a person or a script.
const DATA_PREFIXES = ['/indexes/atlas/', '/atlas/'];
const DATA_FILE = /^(?:(?:state|fleet)\.json|[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/(?:structure\.json|statistics\.json|page\.json|divergence\.json|history\.json|README\.md))$/;

/**
 * The page shell with its data base pointed at this server. The public page
 * has no such tag and reads the render branch.
 */
export function servedShell(html) {
  if (!/<head>/i.test(html)) throw new Error('the Atlas page shell has no <head> to name its data base in');
  return html.replace(/<head>/i, '<head>\n<meta name="atlas-base" content="/">');
}

/**
 * The fleet list at /, a repository's page at /?repo=owner/name, and the
 * render files from /data/atlas. Static, read-only, no auth; nothing else
 * under /data is reachable, so fleet.yml and its clone URLs never are.
 */
export function createFleetServer({ dataDir, assetsDir }) {
  const shell = servedShell(readFileSync(join(assetsDir, 'index.html'), 'utf8'));
  const atlasDir = resolve(atlasDirOf(dataDir));
  return createServer((request, response) => {
    const send = (status, body, type = 'text/plain; charset=utf-8', extra = {}) => {
      response.writeHead(status, {
        'content-type': type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...extra,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(405, 'method not allowed\n', undefined, { allow: 'GET, HEAD' });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://atlas.invalid').pathname);
    } catch {
      send(400, 'bad request\n');
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      send(200, shell, CONTENT_TYPES['.html']);
      return;
    }
    const asset = pathname.slice(1);
    if (ASSETS.has(asset)) {
      send(200, readFileSync(join(assetsDir, asset)), CONTENT_TYPES[extname(asset)]);
      return;
    }
    const prefix = DATA_PREFIXES.find((candidate) => pathname.startsWith(candidate));
    const rel = prefix ? pathname.slice(prefix.length) : '';
    if (!prefix || !DATA_FILE.test(rel) || rel.split('/').some((part) => /^\.+$/.test(part))) {
      send(404, 'not found\n');
      return;
    }
    const file = resolve(atlasDir, ...rel.split('/'));
    if (!file.startsWith(atlasDir + sep) || !existsSync(file)) {
      send(404, 'not found\n');
      return;
    }
    send(200, readFileSync(file), CONTENT_TYPES[extname(file)]);
  });
}

/**
 * The service: serve, map at once when /data holds no state, then map on the
 * schedule. The fleet file is read again before every run, so an edit to its
 * list takes effect without a restart; a change of port or schedule needs one.
 */
export async function startFleetService({ dataDir, assetsDir, log = (line) => process.stdout.write(`${line}\n`) }) {
  const configPath = join(dataDir, 'fleet.yml');
  if (!existsSync(configPath)) throw new Error(`no fleet file at ${configPath}; see fleet.example.yml`);
  const config = readFleetConfig(readFileSync(configPath, 'utf8'));
  const cron = parseCron(config.schedule);
  const server = createFleetServer({ dataDir, assetsDir });
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(config.port, '0.0.0.0', done);
  });
  log(`atlas-fleet serving on 0.0.0.0:${config.port}, ${config.repositories.length} repositories, schedule ${config.schedule} UTC`);
  let running = false;
  let timer = null;
  const runNow = async () => {
    if (running) return;
    running = true;
    try {
      let current = config;
      try {
        current = readFleetConfig(readFileSync(configPath, 'utf8'));
      } catch (error) {
        log(`fleet.yml unreadable, keeping the last good list: ${error.message}`);
      }
      await runFleetOnce({ dataDir, config: current, log });
      log('run finished');
    } catch (error) {
      log(`run failed: ${redact(error.message)}`);
    } finally {
      running = false;
    }
  };
  const arm = () => {
    const due = nextRun(cron, new Date());
    // setTimeout holds at most about 24.8 days; a later run re-arms on waking.
    const wait = Math.min(due.getTime() - Date.now(), 2_147_000_000);
    timer = setTimeout(async () => {
      if (Date.now() >= due.getTime()) await runNow();
      arm();
    }, Math.max(0, wait));
  };
  const first = isFirstStart(dataDir);
  if (first) log('no state in /data: mapping now');
  const firstRun = first ? runNow() : Promise.resolve();
  arm();
  const stop = () => new Promise((done) => {
    if (timer) clearTimeout(timer);
    server.close(() => done());
  });
  return { server, firstRun, stop };
}
