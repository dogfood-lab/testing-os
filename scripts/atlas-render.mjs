/**
 * Weekly render of every public repository that has adopted Atlas.
 * Listing and clones are unauthenticated. A token is used only to push
 * atlas-render and to open or comment on an issue.
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

export const ORGS = ['mcp-tool-shop-org', 'dogfood-lab'];
export const HOME = 'dogfood-lab/testing-os';
// All three waits are used, so a transport failure is four attempts. The 60s wait is not dropped.
export const BACKOFF_MS = [5_000, 20_000, 60_000];
export const REPO_BUDGET_MS = 90_000;
export const JOB_BUDGET_MS = 50 * 60 * 1000;
export const WINDOW_DAYS = 180;
const RENDER_FILES = ['structure.json', 'statistics.json', 'orientation.md', 'dev.md', 'machine.md', 'machine-stats.txt'];
const PUBLIC_HEADERS = {
  accept: 'application/vnd.github+json',
  'user-agent': 'atlas-render',
  'x-github-api-version': '2022-11-28',
};

function repoRootDefault() {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

export function readExclusions(text) {
  const names = new Set();
  for (const line of String(text).split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    names.add(trimmed);
  }
  return names;
}

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

export function rejectForeignPaths(paths, publicNames) {
  const foreign = [];
  for (const path of paths) {
    if (path.startsWith('.github/')) foreign.push(path);
    const match = /^indexes\/atlas\/([^/]+)\/([^/]+)(?:\/|$)/.exec(path);
    if (!match) continue;
    const name = `${match[1]}/${match[2]}`;
    if (!publicNames.has(name)) foreign.push(path);
  }
  if (foreign.length > 0) {
    throw new Error(`refusing to publish a path outside the public listing: ${foreign.join(', ')}`);
  }
}

function header(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const found = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return found ? headers[found] : null;
}

function nextLink(headers) {
  const link = header(headers, 'link');
  if (!link) return null;
  const part = link.split(',').find((entry) => /rel="next"/.test(entry));
  const match = part && part.match(/<([^>]+)>/);
  return match ? match[1] : null;
}

async function github(fetchImpl, url, extraHeaders = {}) {
  const response = await fetchImpl(url, { headers: { ...PUBLIC_HEADERS, ...extraHeaders } });
  const status = response.status ?? (response.ok === false ? 500 : 200);
  const ok = response.ok ?? status < 400;
  let json = null;
  if (ok && typeof response.json === 'function') json = await response.json();
  return { ok, status, json, headers: response.headers };
}

export async function listPublic(fetchImpl) {
  const repos = [];
  for (const org of ORGS) {
    let url = `https://api.github.com/orgs/${org}/repos?type=public&per_page=100`;
    while (url) {
      const page = await github(fetchImpl, url);
      if (!page.ok) throw new Error(`listing ${org} failed: ${page.status}`);
      for (const repo of page.json ?? []) {
        if (repo.visibility !== 'public' || repo.archived === true) continue;
        if (typeof repo.full_name !== 'string') continue;
        repos.push({ fullName: repo.full_name, defaultBranch: repo.default_branch || 'main' });
      }
      url = nextLink(page.headers);
    }
  }
  return repos;
}

async function readJsonUrl(fetchImpl, url) {
  const response = await github(fetchImpl, url);
  if (!response.ok) return null;
  return response.json;
}

async function defaultBranchHead(fetchImpl, fullName, branch) {
  const commit = await github(fetchImpl, `https://api.github.com/repos/${fullName}/commits/${encodeURIComponent(branch)}`);
  if (!commit.ok) throw new Error(`commit ${fullName} failed: ${commit.status}`);
  return { branch, sha: commit.json.sha };
}

function openIds(envelope) {
  const ids = new Set();
  for (const row of envelope?.rows ?? []) {
    if (row.state === 'open' && row.id) ids.add(row.id);
  }
  return ids;
}

function rowLine(row) {
  if (row.rule === 'two-may-be-one') return `${row.rule} ${(row.boundaries ?? []).join(' · ')}`;
  if (row.rule === 'file-moved') return `${row.rule} ${row.boundary} ${row.file} → ${row.partner_boundary}`;
  return `${row.rule} ${row.boundary ?? ''}`.trim();
}

function diffRows(beforeEnvelope, afterEnvelope) {
  const before = new Map((beforeEnvelope?.rows ?? []).filter((row) => row.state === 'open').map((row) => [row.id, row]));
  const after = new Map((afterEnvelope?.rows ?? []).filter((row) => row.state === 'open').map((row) => [row.id, row]));
  const opened = [];
  const cleared = [];
  for (const [id, row] of after) if (!before.has(id)) opened.push(row);
  for (const [id, row] of before) if (!after.has(id)) cleared.push(row);
  return { opened, cleared };
}

export function fleetEntry(fullName, commit, renderedAt, now, structure, statistics, envelope) {
  const boundaries = structure?.boundaries ?? [];
  const unnamed = boundaries.filter((boundary) => boundary.status !== 'accepted').length;
  const unresolved = boundaries.reduce((sum, boundary) => sum + (boundary.unresolvedSites ?? 0), 0);
  const openDivergence = (envelope?.rows ?? []).filter((row) => row.state === 'open').length;
  const ageDays = Math.max(0, Math.floor((now.getTime() - Date.parse(renderedAt)) / 86_400_000));
  return {
    repo: fullName,
    commit,
    renderedAt,
    ageDays,
    boundaries: boundaries.length,
    unnamed,
    unresolved,
    openDivergence,
    confidence: statistics?.confidence?.level ?? 'low',
  };
}

function defaultRun(command, args, opts = {}) {
  return new Promise((resolve) => {
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
      resolve({ status: timedOut ? 124 : (status ?? 1), stdout, stderr, timedOut });
    });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: error.message });
    });
  });
}

function budgetLeft(timeoutMs) {
  return typeof timeoutMs === 'function' ? timeoutMs() : timeoutMs;
}

function unauthenticatedGitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
  };
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(abs));
    else found.push(abs);
  }
  return found;
}

async function cloneWithBackoff({ run, sleep, fullName, branch, dest, timeoutMs, since }) {
  const url = `https://github.com/${fullName}.git`;
  const args = ['clone', '--shallow-since', since, '--single-branch', '--branch', branch, url, dest];
  const env = unauthenticatedGitEnv();
  const once = async () => {
    const left = budgetLeft(timeoutMs);
    if (left <= 0) return { status: 1, stdout: '', stderr: 'budget', budget: true };
    return run('git', args, { timeoutMs: left, env });
  };
  let result = await once();
  if (result.status === 0 || result.budget || result.timedOut) return result;
  for (const wait of BACKOFF_MS) {
    const left = budgetLeft(timeoutMs);
    if (left <= 0) return { status: 1, stdout: '', stderr: 'budget', budget: true };
    await sleep(Math.min(wait, left));
    result = await once();
    if (result.status === 0 || result.budget || result.timedOut) return result;
  }
  return result;
}

async function renderOne({ run, sleep, fetchImpl, repoRoot, fullName, branch, sha, now, state, outRoot, log }) {
  const started = Date.now();
  const remaining = () => REPO_BUDGET_MS - (Date.now() - started);
  const dest = mkdtempSync(join(tmpdir(), 'atlas-clone-'));
  const scratch = mkdtempSync(join(tmpdir(), 'atlas-prev-'));
  const out = join(outRoot, ...fullName.split('/'));
  const abandon = (reason) => {
    state.failures[fullName] = { commit: sha, at: now.toISOString(), reason };
    rmSync(out, { recursive: true, force: true });
    log(`failure ${fullName} ${reason}`);
    return { kind: 'failure' };
  };
  try {
    if (remaining() <= 0) return abandon('budget');
    const cloned = await cloneWithBackoff({
      run, sleep, fullName, branch, dest, timeoutMs: remaining, since: shallowSinceDate(now),
    });
    if (cloned.budget || cloned.timedOut) return abandon('budget');
    if (cloned.status !== 0) return abandon('clone');
    if (!existsSync(join(dest, 'atlas', 'boundaries.yaml'))) {
      state.rendered[fullName] = { commit: sha, renderedAt: now.toISOString(), notMapped: true };
      delete state.failures[fullName];
      log(`not-mapped ${fullName}`);
      return { kind: 'not-mapped' };
    }
    const earlier = earlierWindow(readFileSync(join(dest, 'atlas', 'boundaries.yaml'), 'utf8'), now);
    if (earlier) {
      const fetched = await run('git', ['fetch', '--shallow-since', earlier, 'origin'], {
        cwd: dest,
        timeoutMs: Math.max(1, remaining()),
        env: unauthenticatedGitEnv(),
      });
      if (fetched?.timedOut || fetched?.budget) return abandon('budget');
      if (!fetched || fetched.status !== 0) return abandon('clone');
    }
    mkdirSync(out, { recursive: true });
    const previousUrl = `https://raw.githubusercontent.com/${HOME}/atlas-render/indexes/atlas/${fullName}/divergence.json`;
    const previousJson = await readJsonUrl(fetchImpl, previousUrl);
    const previousPath = join(scratch, 'previous.json');
    const divergencePath = join(out, 'divergence.json');
    const args = [join(repoRoot, 'packages', 'atlas', 'cli.js'), 'map', '--divergence', divergencePath];
    if (previousJson) {
      writeFileSync(previousPath, JSON.stringify(previousJson));
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
    for (const name of RENDER_FILES) cpSync(join(dest, 'atlas', name), join(out, name));
    const renderedAt = now.toISOString();
    state.rendered[fullName] = { commit: sha, renderedAt };
    delete state.failures[fullName];
    const structure = JSON.parse(readFileSync(join(out, 'structure.json'), 'utf8'));
    const statistics = JSON.parse(readFileSync(join(out, 'statistics.json'), 'utf8'));
    const envelope = JSON.parse(readFileSync(divergencePath, 'utf8'));
    log(`render ${fullName}`);
    return { kind: 'rendered', entry: fleetEntry(fullName, sha, renderedAt, now, structure, statistics, envelope), envelope, previous: previousJson };
  } finally {
    try { rmSync(dest, { recursive: true, force: true }); } catch { /* a locked clone is scratch, not a render failure */ }
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* same */ }
  }
}

function issueBody(date, changes) {
  const lines = [`Compare: https://github.com/${HOME}/compare/main...atlas-render`, ''];
  for (const change of changes) {
    lines.push(`## ${change.repo}`);
    for (const row of change.opened) lines.push(`opened: ${rowLine(row)}`);
    for (const row of change.cleared) lines.push(`cleared: ${rowLine(row)}`);
    if (change.opened.length === 0 && change.cleared.length === 0) lines.push('unchanged');
    lines.push('');
  }
  return { title: `atlas: divergence changed ${date}`, body: lines.join('\n') };
}

async function publishIssue(issues, date, changes) {
  const { title, body } = issueBody(date, changes);
  const open = await issues.listOpen();
  const existing = (open ?? []).find((issue) => typeof issue.title === 'string' && issue.title.startsWith('atlas: divergence changed'));
  if (existing) {
    await issues.comment(existing.number, body);
    return { action: 'comment', number: existing.number, title };
  }
  await issues.create(title, body);
  return { action: 'open', title };
}

export async function renderFleet(options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const run = options.run ?? defaultRun;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ? options.now() : new Date();
  const dryRun = options.dryRun === true;
  const repoRoot = options.repoRoot ?? repoRootDefault();
  const logs = [];
  const log = (line) => {
    logs.push(line);
    if (options.log) options.log(line);
    else process.stdout.write(`${line}\n`);
  };
  const excludeText = existsSync(join(repoRoot, 'indexes', 'atlas', 'exclude.txt'))
    ? readFileSync(join(repoRoot, 'indexes', 'atlas', 'exclude.txt'), 'utf8')
    : '';
  const excluded = readExclusions(excludeText);
  const listed = await listPublic(fetchImpl);
  const publicNames = new Set(listed.map((repo) => repo.fullName));
  log(`listed ${listed.length} public repositories`);
  let work = listed.filter((repo) => !excluded.has(repo.fullName));
  if (options.only) work = work.filter((repo) => repo.fullName === options.only);
  work.sort((a, b) => (a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0));
  const clock = options.clock ?? (() => new Date());
  const jobStartedMs = clock().getTime();
  const jobBudgetMs = options.jobBudgetMs ?? JOB_BUDGET_MS;
  const stateResponse = await readJsonUrl(fetchImpl, `https://raw.githubusercontent.com/${HOME}/atlas-render/indexes/atlas/state.json`);
  const previousFleet = await readJsonUrl(fetchImpl, `https://raw.githubusercontent.com/${HOME}/atlas-render/indexes/atlas/fleet.json`);
  const state = {
    rendered: { ...(stateResponse?.rendered ?? {}) },
    failures: { ...(stateResponse?.failures ?? {}) },
  };
  const ownOut = !options.outRoot;
  const outRoot = options.outRoot ?? mkdtempSync(join(tmpdir(), 'atlas-out-'));
  const renderedNow = [];
  const changes = [];
  let changed = false;
  try {
  for (let index = 0; index < work.length; index += 1) {
    if (clock().getTime() - jobStartedMs >= jobBudgetMs) {
      const remain = work.length - index;
      const noun = remain === 1 ? 'repository remains' : 'repositories remain';
      log(`job budget reached, ${remain} ${noun}`);
      break;
    }
    const repo = work[index];
    let head;
    try {
      head = await defaultBranchHead(fetchImpl, repo.fullName, repo.defaultBranch);
    } catch (error) {
      state.failures[repo.fullName] = { commit: null, at: now.toISOString(), reason: error.message };
      log(`failure ${repo.fullName} head`);
      continue;
    }
    const known = state.rendered[repo.fullName];
    if (known && known.commit === head.sha && !known.notMapped) {
      log(`skip ${repo.fullName} unchanged`);
      continue;
    }
    if (known && known.commit === head.sha && known.notMapped) {
      log(`skip ${repo.fullName} not-mapped`);
      continue;
    }
    let result;
    try {
      result = await renderOne({
        run, sleep, fetchImpl, repoRoot, fullName: repo.fullName, branch: head.branch, sha: head.sha, now, state, outRoot, log,
      });
    } catch (error) {
      state.failures[repo.fullName] = { commit: head.sha, at: now.toISOString(), reason: error.message || 'map' };
      rmSync(join(outRoot, ...repo.fullName.split('/')), { recursive: true, force: true });
      log(`failure ${repo.fullName} ${error.message || 'map'}`);
      continue;
    }
    if (result.kind !== 'rendered') continue;
    renderedNow.push(result.entry);
    const delta = diffRows(result.previous, result.envelope);
    if (delta.opened.length > 0 || delta.cleared.length > 0) {
      changed = true;
      changes.push({ repo: repo.fullName, ...delta });
    }
  }
  for (const bucket of [state.rendered, state.failures]) {
    for (const name of Object.keys(bucket)) {
      if (!publicNames.has(name)) delete bucket[name];
    }
  }
  const ageDays = (renderedAt) => Math.max(0, Math.floor((now.getTime() - Date.parse(renderedAt)) / 86_400_000));
  const byRepo = new Map();
  for (const entry of previousFleet?.repositories ?? []) {
    if (!entry || typeof entry.repo !== 'string' || !publicNames.has(entry.repo) || excluded.has(entry.repo)) continue;
    if (state.rendered[entry.repo]?.notMapped) continue;
    byRepo.set(entry.repo, { ...entry, ageDays: ageDays(entry.renderedAt) });
  }
  for (const entry of renderedNow) byRepo.set(entry.repo, entry);
  const fleet = [...byRepo.values()].sort((a, b) => a.repo.localeCompare(b.repo));
  const date = now.toISOString().slice(0, 10);
  const paths = ['indexes/atlas/state.json', 'indexes/atlas/fleet.json'];
  for (const entry of renderedNow) {
    for (const name of [...RENDER_FILES, 'divergence.json']) {
      paths.push(`indexes/atlas/${entry.repo}/${name}`);
    }
  }
  rejectForeignPaths(paths, publicNames);
  const fleetDoc = { generatedAt: now.toISOString(), repositories: fleet };
  log(`would commit atlas: weekly render ${date}`);
  for (const path of paths) log(`file ${path}`);
  let issue = null;
  if (!dryRun) {
    if (options.writeBranch) await options.writeBranch({ state, fleet: fleetDoc, outRoot, paths, date, publicNames });
    if (changed && options.issues) issue = await publishIssue(options.issues, date, changes);
  }
  return { logs, state, fleet: fleetDoc, paths, changed, changes, issue, publicCount: listed.length };
  } finally {
    if (ownOut) rmSync(outRoot, { recursive: true, force: true });
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const issues = !dryRun && token ? githubIssues(globalThis.fetch.bind(globalThis), token) : null;
  const result = await renderFleet({
    dryRun,
    only,
    issues,
    writeBranch: dryRun ? null : (payload) => commitBranch(payload, token),
  });
  process.stdout.write(`public ${result.publicCount}\n`);
}

function githubIssues(fetchImpl, token) {
  const headers = { ...PUBLIC_HEADERS, authorization: `Bearer ${token}` };
  return {
    async listOpen() {
      const response = await github(fetchImpl, `https://api.github.com/repos/${HOME}/issues?state=open&per_page=100`, headers);
      return response.json ?? [];
    },
    async create(title, body) {
      await fetchImpl(`https://api.github.com/repos/${HOME}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, body }),
      });
    },
    async comment(number, body) {
      await fetchImpl(`https://api.github.com/repos/${HOME}/issues/${number}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body }),
      });
    },
  };
}

async function commitBranch({ state, fleet, outRoot, date, publicNames }, token) {
  const work = mkdtempSync(join(tmpdir(), 'atlas-render-branch-'));
  try {
    const remote = `https://github.com/${HOME}.git`;
    const anon = { env: unauthenticatedGitEnv() };
    const probe = await defaultRun('git', ['ls-remote', '--heads', remote, 'atlas-render'], anon);
    const exists = probe.stdout.includes('refs/heads/atlas-render');
    const branch = exists ? 'atlas-render' : 'main';
    // This checkout is the branch being published. It is not mapped, so blob contents are never walked.
    const cloned = await defaultRun('git', ['clone', '--filter=blob:none', '--single-branch', '--branch', branch, remote, work], anon);
    if (cloned.status !== 0) throw new Error('clone of the render branch failed');
    if (!exists) {
      const created = await defaultRun('git', ['checkout', '-B', 'atlas-render'], { cwd: work });
      if (created.status !== 0) throw new Error('could not create atlas-render');
    }
    mkdirSync(join(work, 'indexes', 'atlas'), { recursive: true });
    writeFileSync(join(work, 'indexes', 'atlas', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
    writeFileSync(join(work, 'indexes', 'atlas', 'fleet.json'), `${JSON.stringify(fleet, null, 2)}\n`);
    cpSync(outRoot, join(work, 'indexes', 'atlas'), { recursive: true });
    const published = filesUnder(join(work, 'indexes', 'atlas')).map((abs) => relative(work, abs).replaceAll('\\', '/'));
    rejectForeignPaths(published, publicNames);
    await defaultRun('git', ['add', '--', 'indexes/atlas'], { cwd: work });
    const committed = await defaultRun('git', ['-c', 'user.email=64996768+mcp-tool-shop@users.noreply.github.com', '-c', 'user.name=mcp-tool-shop', 'commit', '-m', `atlas: weekly render ${date}`], { cwd: work });
    if (committed.status !== 0) throw new Error('commit of atlas-render failed');
    const env = unauthenticatedGitEnv();
    if (token) {
      env.GIT_CONFIG_COUNT = '2';
      env.GIT_CONFIG_KEY_1 = 'http.extraheader';
      env.GIT_CONFIG_VALUE_1 = `AUTHORIZATION: bearer ${token}`;
    }
    // A missing remote ref has no lease to compare. Create it with a plain push; later runs use the lease.
    const pushArgs = exists
      ? ['push', '--force-with-lease', 'origin', 'HEAD:atlas-render']
      : ['push', 'origin', 'HEAD:atlas-render'];
    const pushed = await defaultRun('git', pushArgs, { cwd: work, env });
    if (pushed.status !== 0) throw new Error('push of atlas-render failed');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
