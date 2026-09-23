/**
 * Weekly render of every public repository that has adopted Atlas.
 * Listing and clones are unauthenticated. A token is used only to push
 * atlas-render and to open or comment on an issue.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BACKOFF_MS,
  ENGINE,
  HISTORY_CAP,
  REPO_BUDGET_MS,
  RENDER_FILES,
  WINDOW_DAYS,
  appendHistory,
  changeCount,
  cloneWithBackoff,
  commandReason,
  defaultRun,
  earlierWindow,
  headSha,
  historyEntry,
  mergeFleet,
  renderOne,
  shallowSinceDate,
  skipReason,
  stateFrom,
  unauthenticatedGitEnv,
} from '@dogfood-lab/atlas/fleet';

// The render of one repository, its history and the state and fleet shapes
// live in the package, shared with the container service; this script keeps
// what is GitHub's: the listing, the render branch and the issue.
export { BACKOFF_MS, HISTORY_CAP, REPO_BUDGET_MS, WINDOW_DAYS, appendHistory, changeCount, earlierWindow, historyEntry, shallowSinceDate };

export const ORGS = ['mcp-tool-shop-org', 'dogfood-lab'];
export const HOME = 'dogfood-lab/testing-os';
export const JOB_BUDGET_MS = 50 * 60 * 1000;
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

function gitError(message, result) {
  const detail = (result?.stderr || result?.stdout || '').trim().slice(0, 200);
  return detail ? `${message}: ${detail}` : message;
}

export function pushAuthEnv(token) {
  const env = unauthenticatedGitEnv();
  if (!token) return env;
  env.GIT_CONFIG_COUNT = '2';
  env.GIT_CONFIG_KEY_1 = 'http.extraheader';
  env.GIT_CONFIG_VALUE_1 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  return env;
}

async function defaultBranchHead(run, fullName, branch) {
  const url = `https://github.com/${fullName}.git`;
  const result = await run('git', ['ls-remote', '--heads', url, branch], { env: unauthenticatedGitEnv() });
  const sha = result?.status === 0 ? headSha(result.stdout) : null;
  if (!sha) throw new Error(commandReason('head', result));
  return { branch, sha };
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

// The history already on the render branch. Absent is a first run; any other
// failure is not, and returns undefined so the render writes no history.json
// and the branch keeps the one it has, rather than restarting a year of
// entries from one.
async function previousHistory(fetchImpl, fullName) {
  const url = `https://raw.githubusercontent.com/${HOME}/atlas-render/indexes/atlas/${fullName}/history.json`;
  let response;
  try {
    response = await github(fetchImpl, url);
  } catch {
    return undefined;
  }
  if (response.status === 404) return null;
  if (!response.ok) return undefined;
  const doc = response.json;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.entries)) return undefined;
  return doc;
}

// One public repository, cloned fresh from GitHub into scratch; the last
// render's divergence and history are read from the render branch.
function renderPublic({ run, sleep, fetchImpl, repoRoot, fullName, branch, sha, now, state, outRoot, log, engine }) {
  return renderOne({
    engine,
    run,
    fullName,
    sha,
    now,
    state,
    outRoot,
    log,
    cli: join(repoRoot, 'packages', 'atlas', 'cli.js'),
    checkout: async ({ remaining, since }) => {
      const dir = mkdtempSync(join(tmpdir(), 'atlas-clone-'));
      const env = unauthenticatedGitEnv();
      const cloned = await cloneWithBackoff({
        run, sleep, url: `https://github.com/${fullName}.git`, branch, dest: dir, timeoutMs: remaining, since, env,
      });
      return { ...cloned, dir, env, dispose: () => rmSync(dir, { recursive: true, force: true }) };
    },
    previous: {
      divergence: () => readJsonUrl(fetchImpl, `https://raw.githubusercontent.com/${HOME}/atlas-render/indexes/atlas/${fullName}/divergence.json`),
      history: () => previousHistory(fetchImpl, fullName),
    },
  });
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
  // The job runs the engine in this tree, which changes between releases
  // without the version moving, so the stamp carries the tree's commit too.
  const engine = options.engine ?? (process.env.GITHUB_SHA ? `${ENGINE}+${process.env.GITHUB_SHA.slice(0, 12)}` : ENGINE);
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
  const state = stateFrom(stateResponse);
  const ownOut = !options.outRoot;
  const outRoot = options.outRoot ?? mkdtempSync(join(tmpdir(), 'atlas-out-'));
  const renderedNow = [];
  const withHistory = new Set();
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
      head = await defaultBranchHead(run, repo.fullName, repo.defaultBranch);
    } catch (error) {
      const reason = error.message || 'head';
      state.failures[repo.fullName] = { commit: null, at: now.toISOString(), reason };
      log(`failure ${repo.fullName} ${reason}`);
      continue;
    }
    const before = (previousFleet?.repositories ?? []).find((entry) => entry?.repo === repo.fullName);
    const skip = skipReason(state.rendered[repo.fullName], head.sha, before, engine);
    if (skip) {
      log(`skip ${repo.fullName} ${skip}`);
      continue;
    }
    let result;
    try {
      result = await renderPublic({
        run, sleep, fetchImpl, repoRoot, fullName: repo.fullName, branch: head.branch, sha: head.sha, now, state, outRoot, log, engine,
      });
    } catch (error) {
      state.failures[repo.fullName] = { commit: head.sha, at: now.toISOString(), reason: error.message || 'map' };
      rmSync(join(outRoot, ...repo.fullName.split('/')), { recursive: true, force: true });
      log(`failure ${repo.fullName} ${error.message || 'map'}`);
      continue;
    }
    if (result.kind !== 'rendered') continue;
    renderedNow.push(result.entry);
    if (result.historyWritten) withHistory.add(repo.fullName);
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
  const keep = (name) => publicNames.has(name) && !excluded.has(name) && !state.rendered[name]?.notMapped;
  const fleet = mergeFleet(previousFleet?.repositories, renderedNow, keep, now);
  const date = now.toISOString().slice(0, 10);
  const paths = ['indexes/atlas/state.json', 'indexes/atlas/fleet.json'];
  for (const entry of renderedNow) {
    const names = [...RENDER_FILES, 'divergence.json', ...(withHistory.has(entry.repo) ? ['history.json'] : [])];
    for (const name of names) paths.push(`indexes/atlas/${entry.repo}/${name}`);
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
    if (probe.status !== 0) throw new Error(gitError('listing atlas-render failed', probe));
    const exists = probe.stdout.includes('refs/heads/atlas-render');
    const branch = exists ? 'atlas-render' : 'main';
    // This checkout is the branch being published. It is not mapped, so blob contents are never walked.
    const cloned = await defaultRun('git', ['clone', '--filter=blob:none', '--single-branch', '--branch', branch, remote, work], anon);
    if (cloned.status !== 0) throw new Error(gitError('clone of the render branch failed', cloned));
    if (!exists) {
      const created = await defaultRun('git', ['checkout', '-B', 'atlas-render'], { cwd: work });
      if (created.status !== 0) throw new Error(gitError('could not create atlas-render', created));
    }
    mkdirSync(join(work, 'indexes', 'atlas'), { recursive: true });
    writeFileSync(join(work, 'indexes', 'atlas', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
    writeFileSync(join(work, 'indexes', 'atlas', 'fleet.json'), `${JSON.stringify(fleet, null, 2)}\n`);
    cpSync(outRoot, join(work, 'indexes', 'atlas'), { recursive: true });
    const published = filesUnder(join(work, 'indexes', 'atlas')).map((abs) => relative(work, abs).replaceAll('\\', '/'));
    rejectForeignPaths(published, publicNames);
    await defaultRun('git', ['add', '--', 'indexes/atlas'], { cwd: work });
    const committed = await defaultRun('git', ['-c', 'user.email=64996768+mcp-tool-shop@users.noreply.github.com', '-c', 'user.name=mcp-tool-shop', 'commit', '-m', `atlas: weekly render ${date}`], { cwd: work });
    if (committed.status !== 0) throw new Error(gitError('commit of atlas-render failed', committed));
    // A missing remote ref has no lease to compare. Create it with a plain push; later runs use the lease.
    const pushArgs = exists
      ? ['push', '--force-with-lease', 'origin', 'HEAD:atlas-render']
      : ['push', 'origin', 'HEAD:atlas-render'];
    const pushed = await defaultRun('git', pushArgs, { cwd: work, env: pushAuthEnv(token) });
    if (pushed.status !== 0) throw new Error(gitError('push of atlas-render failed', pushed));
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
