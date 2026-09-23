import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse } from 'yaml';
import { better, cleanDir, commandLines, readCommands, repositoryView, RUNS_RECORDED } from './commands.js';

const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const TRIGGER_LISTS = ['paths', 'branches', 'tags', 'types', 'workflows'];

// What a step's command text sends out of the repository, by the command
// that sends it. A registry is named the way its users name it.
const PUBLISH_COMMANDS = [
  [/\b(?:npm|pnpm)\s+publish\b|\byarn\s+(?:npm\s+)?publish\b/, 'npm'],
  [/\btwine\s+upload\b|\b(?:uv|poetry|hatch|flit)\s+publish\b/, 'pypi'],
  [/\bcargo\s+publish\b/, 'crates.io'],
  [/\bgem\s+push\b/, 'rubygems'],
  [/\b(?:docker|podman)\s+push\b|\bdocker\s+(?:buildx\s+)?build\b[^\n]*\s--push\b/, 'container image'],
];
// And by the action a step uses, matched on the action's name without its ref.
const ACTION_SENDS = [
  ['pypa/gh-action-pypi-publish', (sends) => sends.publishesTo.add('pypi')],
  ['docker/build-push-action', (sends, step) => {
    if (pushes(step.with?.push)) sends.publishesTo.add('container image');
  }],
  ['softprops/action-gh-release', (sends) => { sends.releases = true; }],
  ['ncipollo/release-action', (sends) => { sends.releases = true; }],
  ['actions/deploy-pages', (sends) => { sends.deploysPages = true; }],
  ['peaceiris/actions-gh-pages', (sends) => { sends.deploysPages = true; }],
  ['peter-evans/create-pull-request', (sends) => { sends.opensPullRequests = true; }],
];

/**
 * Read every tracked workflow under .github/workflows and describe it as a
 * door: what starts it, what it runs, what it may touch and what it sends.
 * A workflow that does not parse is still a door; it is recorded as such and
 * the rest of the map is unaffected.
 *
 * @param {{ repoPath: string, tracked: Set<string>, spawned?: Map<string, string[]> }} input
 *   spawned holds, per JavaScript or TypeScript file, the command lines it
 *   hands to a child process (core/spawned.js)
 */
export function mapDoors({ repoPath, tracked, spawned }) {
  const repo = repositoryView({ repoPath, tracked, spawned });
  return [...tracked]
    .filter(isWorkflow)
    .sort()
    .map((file) => readDoor(repoPath, file, repo));
}

export function isWorkflow(path) {
  return WORKFLOW.test(path);
}

function readDoor(repoPath, file, repo) {
  const fallback = posix.basename(file).replace(/\.ya?ml$/, '');
  let text;
  let doc;
  try {
    text = readFileSync(join(repoPath, file), 'utf8');
    doc = parse(text);
  } catch {
    return { file, name: fallback, parseError: true };
  }
  if (!isMapping(doc)) return { file, name: fallback, parseError: true };

  const permissions = new Set(permissionList(doc.permissions));
  const commands = [];
  const uses = new Set();
  const runs = new Map();
  const mentions = new Map();
  const stages = new Set();
  const sends = { publishesTo: new Set(), releases: false, deploysPages: false, opensPullRequests: false };
  const issues = [];
  const workflowDir = workingDirectory(doc.defaults);
  const workflowEnv = envOf(doc.env);
  for (const [job, body] of Object.entries(isMapping(doc.jobs) ? doc.jobs : {})) {
    if (!isMapping(body)) continue;
    for (const permission of permissionList(body.permissions)) permissions.add(permission);
    const jobDir = workingDirectory(body.defaults) ?? workflowDir ?? '';
    const jobEnv = envOf(body.env);
    const steps = Array.isArray(body.steps) ? body.steps : [];
    steps.forEach((step, index) => {
      if (!isMapping(step)) return;
      if (typeof step.uses === 'string') {
        const action = step.uses.replace(/@.*$/, '');
        uses.add(action);
        for (const [name, apply] of ACTION_SENDS) if (action === name || action.startsWith(`${name}/`)) apply(sends, step);
      }
      if (typeof step.run !== 'string') return;
      const name = typeof step.name === 'string' && step.name.trim() !== '' ? step.name : String(index);
      commands.push({ job, step: name, text: step.run });
      const stepEnv = envOf(step.env);
      const lookup = (variable) => [stepEnv, jobEnv, workflowEnv].find((env) => env.has(variable))?.get(variable) ?? null;
      for (const staged of stagedPaths(step.run, lookup)) stages.add(staged);
      commandSends(step.run, sends);
      if (/\bgh\s+issue\s+create\b/.test(step.run)) issues.push(onlyOnFailure(step.if) || onlyOnFailure(body.if));
      // A step whose working directory cannot be read as a repository path
      // names nothing Atlas can place, so its tokens are left unresolved.
      const dir = step['working-directory'] === undefined ? jobDir : cleanDir(step['working-directory']);
      if (dir == null) return;
      const named = readCommands(step.run, dir, repo);
      for (const entry of named.runs.values()) {
        const key = `${entry.path}\0${job}`;
        const run = { ...entry, job };
        runs.set(key, runs.has(key) ? better(runs.get(key), run) : run);
      }
      for (const path of named.mentions) mentions.set(`${path}\0${job}`, { path, job });
    });
  }

  const recorded = recordedRuns([...runs.values()]);
  const runKeys = new Set(recorded.all.map((run) => `${run.path}\0${run.job}`));
  const underRun = (path, job) => recorded.all.some((run) => run.job === job && run.directory && path.startsWith(run.path));
  const byPathThenJob = (a, b) => compare(a.path, b.path) || compare(a.job, b.job);
  const joined = commands.map((command) => command.text).join('\n');
  const publishesTo = [...sends.publishesTo].sort();
  return {
    file,
    name: typeof doc.name === 'string' && doc.name.trim() !== '' ? doc.name : fallback,
    triggers: triggerList(doc.on),
    permissions: [...permissions].sort(),
    secrets: [...new Set([...text.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]))].sort(),
    usesWorkflowToken: /\bgithub\.token\b|\bsecrets\.GITHUB_TOKEN\b/.test(text),
    commands,
    runs: recorded.kept,
    runsCount: recorded.count,
    mentions: [...mentions.values()]
      .filter((mention) => !runKeys.has(`${mention.path}\0${mention.job}`) && !underRun(mention.path, mention.job))
      .sort(byPathThenJob),
    stages: [...stages].sort(),
    pushes: /\bgit\s+push\b/.test(joined),
    sends: {
      dispatchesTo: [
        ...new Set([...joined.matchAll(/repos\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/dispatches\b/g)].map((m) => `${m[1]}/${m[2]}`)),
      ].sort(),
      publishes: publishesTo.length > 0,
      publishesTo,
      releases: sends.releases,
      deploysPages: sends.deploysPages,
      opensIssues: issues.length > 0,
      opensIssuesOnFailure: issues.length > 0 && issues.every(Boolean),
      opensPullRequests: sends.opensPullRequests,
    },
    uses: [...uses].sort(),
  };
}

/**
 * The runs a door records, sorted by path then job. A file a tool's patterns
 * matched under a directory the same job already runs is not listed again,
 * since the directory stands for it. The list keeps RUNS_RECORDED paths:
 * every path the commands name first, then directories a tool's patterns
 * filled, then the files they matched, taken one from each directory in
 * turn so every directory a tool ran keeps a file and the reach walked from
 * the list reaches every part the door runs. `count` is how many distinct
 * paths there are before that cap, so a door that runs a thousand test files
 * says so without carrying them all, and never loses the script it names.
 */
function recordedRuns(entries) {
  const directories = entries.filter((entry) => entry.directory);
  const covered = (entry) => entry.matched && directories.some((dir) => (
    dir.job === entry.job && entry.path !== dir.path && entry.path.startsWith(dir.path)
  ));
  const all = entries.filter((entry) => !covered(entry)).sort((a, b) => compare(a.path, b.path) || compare(a.job, b.job));
  const rank = new Map();
  for (const entry of all) {
    const own = entry.matched ? (entry.directory ? 1 : 2) : 0;
    rank.set(entry.path, Math.min(rank.get(entry.path) ?? own, own));
  }
  const turn = new Map();
  const taken = new Map();
  for (const path of [...rank.keys()].sort(compare)) {
    if (rank.get(path) !== 2) continue;
    const parent = posix.dirname(path);
    turn.set(path, taken.get(parent) ?? 0);
    taken.set(parent, (taken.get(parent) ?? 0) + 1);
  }
  const paths = [...rank.keys()].sort((a, b) => rank.get(a) - rank.get(b) || (turn.get(a) ?? 0) - (turn.get(b) ?? 0) || compare(a, b));
  const shown = new Set(paths.slice(0, RUNS_RECORDED));
  return { all, kept: all.filter((entry) => shown.has(entry.path)), count: paths.length };
}

function commandSends(run, sends) {
  const text = run.replace(/\\\r?\n/g, ' ');
  for (const [pattern, registry] of PUBLISH_COMMANDS) if (pattern.test(text)) sends.publishesTo.add(registry);
  if (/\bgh\s+release\s+create\b/.test(text)) sends.releases = true;
  if (/\bgh\s+pr\s+create\b/.test(text)) sends.opensPullRequests = true;
}

// A push input set to true, or to an expression that is true on some runs.
function pushes(value) {
  return value === true || value === 'true' || (typeof value === 'string' && value.includes('${{'));
}

/**
 * True when an if: condition holds only after something failed: failure(),
 * or a result or conclusion compared with 'failure', joined by && with
 * anything else. An || with an alternative that needs no failure can hold on
 * a green or a cancelled run, and so can !success(), so neither is one.
 */
export function onlyOnFailure(condition) {
  if (typeof condition !== 'string') return false;
  const expression = condition.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1').trim();
  return topLevel(expression, '&&').some(failureShaped);
}

function failureShaped(part) {
  let text = part.trim();
  while (text.startsWith('(') && text.endsWith(')') && balanced(text.slice(1, -1))) text = text.slice(1, -1).trim();
  const alternatives = topLevel(text, '||');
  if (alternatives.length > 1) return alternatives.every(failureShaped);
  if (topLevel(text, '&&').length > 1) return topLevel(text, '&&').some(failureShaped);
  return /^failure\(\)$/.test(text) || /^[\w.-]+\s*==\s*'failure'$/.test(text);
}

function balanced(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function topLevel(text, operator) {
  const parts = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'") quote = !quote;
    else if (!quote && ch === '(') depth += 1;
    else if (!quote && ch === ')') depth -= 1;
    else if (!quote && depth === 0 && text.startsWith(operator, i)) {
      parts.push(text.slice(start, i));
      start = i + operator.length;
      i += operator.length - 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function envOf(value) {
  const env = new Map();
  if (!isMapping(value)) return env;
  for (const [name, raw] of Object.entries(value)) {
    if (raw == null || typeof raw === 'object') continue;
    const text = String(raw);
    env.set(name, text.includes('${{') ? null : text);
  }
  return env;
}

/**
 * What a step stages with git add. A variable in a staged path is spelled out
 * from an assignment earlier in the same step, then the step's, the job's and
 * the workflow's env; a path whose variable is set at run time stays as
 * written, and the page says so.
 */
function stagedPaths(text, lookup) {
  const staged = [];
  const assigned = new Map();
  for (const tokens of commandLines(text)) {
    if (tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token))) {
      for (const token of tokens) {
        const eq = token.indexOf('=');
        const value = token.slice(eq + 1);
        assigned.set(token.slice(0, eq), value.includes('$') ? null : value);
      }
      continue;
    }
    const value = (name) => (assigned.has(name) ? assigned.get(name) : lookup(name));
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      if (tokens[i] !== 'git' || tokens[i + 1] !== 'add') continue;
      for (const token of tokens.slice(i + 2)) {
        if (token.startsWith('-')) continue;
        staged.push(substitute(token, value));
      }
      break;
    }
  }
  return staged;
}

function substitute(token, value) {
  let unresolved = false;
  const out = token.replace(/\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, a, b, c) => {
    const found = value(a ?? b ?? c);
    if (found == null) {
      unresolved = true;
      return whole;
    }
    return found;
  });
  return unresolved ? token : out;
}

function workingDirectory(defaults) {
  const dir = isMapping(defaults) && isMapping(defaults.run) ? defaults.run['working-directory'] : undefined;
  return dir === undefined ? null : cleanDir(dir);
}

function triggerList(on) {
  const out = [];
  if (typeof on === 'string') out.push({ event: on });
  else if (Array.isArray(on)) {
    for (const event of on) if (typeof event === 'string') out.push({ event });
  } else if (isMapping(on)) {
    for (const [event, config] of Object.entries(on)) {
      if (event === 'schedule') {
        const crons = (Array.isArray(config) ? config : []).filter((entry) => isMapping(entry) && typeof entry.cron === 'string');
        if (crons.length === 0) out.push({ event });
        for (const entry of crons) out.push({ event, cron: entry.cron });
        continue;
      }
      const trigger = { event };
      if (event !== 'workflow_dispatch' && isMapping(config)) {
        for (const field of TRIGGER_LISTS) {
          const list = stringList(config[field]);
          if (list) trigger[field] = [...new Set(list)].sort();
        }
      }
      out.push(trigger);
    }
  }
  const unique = new Map(out.map((trigger) => [canonical(trigger), trigger]));
  return [...unique.entries()]
    .sort(([keyA, a], [keyB, b]) => compare(a.event, b.event) || compare(keyA, keyB))
    .map(([, trigger]) => trigger);
}

function permissionList(value) {
  if (value === 'read-all') return ['all:read'];
  if (value === 'write-all') return ['all:write'];
  if (!isMapping(value)) return [];
  return Object.entries(value)
    .filter(([, level]) => typeof level === 'string')
    .map(([scope, level]) => `${scope}:${level}`);
}


function stringList(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  return null;
}

function isMapping(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isMapping(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
