import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse } from 'yaml';
import { better, cleanDir, commandLines, readCommands, readContainer, readProgram, repositoryView, RUNS_RECORDED } from './commands.js';

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
  ['JS-DevTools/npm-publish', (sends) => sends.publishesTo.add('npm')],
  ['changesets/action', (sends, step) => {
    if (typeof step.with?.publish === 'string' && step.with.publish.trim() !== '') sends.publishesTo.add('npm');
  }],
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
 * @param {{ repoPath: string, tracked: Set<string>, spawned?: Map<string, string[]>, builtFrom?: (path: string) => string|null }} input
 *   spawned holds, per JavaScript or TypeScript file, the command lines it
 *   hands to a child process (core/spawned.js); builtFrom is the source a
 *   build output is compiled from
 */
export function mapDoors({ repoPath, tracked, spawned, commands = [], builtFrom }) {
  const repo = repositoryView({ repoPath, tracked, spawned, commands, builtFrom });
  return [...tracked]
    .filter(isWorkflow)
    .sort()
    .map((file) => readDoor(repoPath, file, repo));
}

/**
 * The commands and the package a repository installs for people (core/
 * entry-points.js manifestCommands), each as a door of kind command or
 * package. Nothing in the repository starts one, so it has no trigger, and it
 * stages and sends nothing; it runs the file its manifest declares, and what
 * that file hands a child process, and its reach is walked from those like any
 * door's. `file` is the manifest that declares it; a manifest can declare
 * several, so a door is told apart by its file and its name together. One
 * whose declared file is a build output no tracked config places runs nothing
 * the map can follow, and carries that path as `unplaced`.
 *
 * @param {{ repoPath: string, tracked: Set<string>, spawned?: Map<string, string[]>, commands: Array<{ kind: string, name: string, manifest: string, path: string }> }} input
 */
export function mapCommandDoors({ repoPath, tracked, spawned, commands, builtFrom }) {
  const repo = repositoryView({ repoPath, tracked, spawned, commands, builtFrom });
  return commands.map((command) => {
    const programs = command.path == null ? [] : (command.paths ?? [command.path]);
    const read = new Map();
    for (const path of programs) {
      for (const [key, run] of readProgram(path, repo)) read.set(key, read.has(key) ? better(read.get(key), run) : run);
    }
    const recorded = recordedRuns([...read.values()]);
    return {
      ...(command.unplaced ? { unplaced: command.unplaced } : {}),
      kind: command.kind,
      file: command.manifest,
      name: command.name,
      triggers: [],
      permissions: [],
      secrets: [],
      usesWorkflowToken: false,
      commands: [],
      runs: recorded.kept,
      runsCount: recorded.count,
      checksCount: recorded.checks,
      mentions: [],
      stages: [],
      pushes: false,
      sends: {
        dispatchesTo: [],
        publishes: false,
        publishesTo: [],
        releases: false,
        deploysPages: false,
        opensIssues: false,
        opensIssuesOnFailure: false,
        opensPullRequests: false,
      },
      uses: [],
    };
  });
}

/**
 * Mark the package door unpublished when nothing here publishes it: no door
 * sends to npm, and the manifest does not both say "private": false and sit
 * beside a workflow named for publishing or releasing. The package is then
 * only its entry, which people cannot import from a registry this
 * repository fills. Nothing is looked up on the network. Mutates the doors.
 *
 * @param {object[]} doors every door of the map
 * @param {Record<string, unknown> | null} manifest the root package.json
 */
export function markUnpublished(doors, manifest) {
  const workflows = doors.filter((door) => !door.kind && !door.parseError);
  const toNpm = workflows.some((door) => door.sends.publishesTo.includes('npm')
    || (door.gated ?? []).some((entry) => entry.sends.includes('publishesTo:npm')));
  const declared = manifest?.private === false
    && workflows.some((door) => /publish|release/i.test(`${posix.basename(door.file)} ${door.name}`));
  if (toNpm || declared) return;
  for (const door of doors) if (door.kind === 'package') door.unpublished = true;
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
  let pushes = false;
  const sidePushes = [];
  const elsewhere = new Map();
  const sends = emptySends();
  const issues = [];
  const texts = [];
  // What a job gated to one trigger does is kept apart, by its gate.
  const gates = new Map();
  // The jobs that run only when an earlier job's output says so.
  const conditional = [];
  const triggers = triggerList(doc.on);
  const workflowDir = workingDirectory(doc.defaults);
  const workflowEnv = envOf(doc.env);
  for (const [job, body] of Object.entries(isMapping(doc.jobs) ? doc.jobs : {})) {
    if (!isMapping(body)) continue;
    const gate = jobGate(body.if, triggers);
    if (typeof body.if === 'string' && /\bneeds\.[\w-]+\.outputs\b/.test(body.if)) conditional.push(job);
    if (gate && !gates.has(canonical(gate))) gates.set(canonical(gate), { when: gate, jobs: [], sends: emptySends(), issues: [], texts: [], stages: new Set(), pushes: false, sidePushes: [] });
    if (gate) gates.get(canonical(gate)).jobs.push(job);
    const scope = gate ? gates.get(canonical(gate)) : { sends, issues, texts, stages, pushes: false, sidePushes: [] };
    // The branch a job has moved onto, which later steps push.
    const branch = { made: false, name: null };
    for (const permission of permissionList(body.permissions)) permissions.add(permission);
    const jobDir = workingDirectory(body.defaults) ?? workflowDir ?? '';
    const jobEnv = envOf(body.env);
    const steps = Array.isArray(body.steps) ? body.steps : [];
    // The clones a job makes, by the directory they are made in: another
    // repository's checkout, read from actions/checkout, and what a step
    // clones. A step that works inside one works on that repository.
    const clones = new Map();
    const rawJobDir = rawWorkingDirectory(body.defaults) ?? rawWorkingDirectory(doc.defaults) ?? '';
    steps.forEach((step, index) => {
      if (!isMapping(step)) return;
      if (typeof step.uses === 'string') {
        const action = step.uses.replace(/@.*$/, '');
        uses.add(action);
        for (const [name, apply] of ACTION_SENDS) if (action === name || action.startsWith(`${name}/`)) apply(scope.sends, step);
        const checkout = otherCheckout(action, step.with);
        if (checkout) clones.set(checkout.dir, checkout.repository);
        // The action builds the image from the context and file it is handed.
        if (action === 'docker/build-push-action' || action === 'redhat-actions/buildah-build') {
          const context = typeof step.with?.context === 'string' && !step.with.context.includes('${{') ? step.with.context : '.';
          const dockerfile = typeof step.with?.file === 'string' && !step.with.file.includes('${{') ? step.with.file : null;
          const dir = workingDirectory(body.defaults) ?? workflowDir ?? '';
          for (const entry of readContainer(context, dockerfile, dir, repo).values()) {
            const key = `${entry.path}\0${job}`;
            const run = { ...entry, job };
            runs.set(key, runs.has(key) ? better(runs.get(key), run) : run);
          }
        }
      }
      if (typeof step.run !== 'string') return;
      const name = typeof step.name === 'string' && step.name.trim() !== '' ? step.name : String(index);
      commands.push({ job, step: name, text: step.run });
      scope.texts.push(step.run);
      const stepEnv = envOf(step.env);
      const lookup = (variable) => [stepEnv, jobEnv, workflowEnv].find((env) => env.has(variable))?.get(variable) ?? null;
      const start = placeOf({ here: true, dir: '' }, step['working-directory'] ?? rawJobDir, clones, repo, lookup);
      const work = gitWork(step.run, lookup, start, clones, repo, branch);
      for (const staged of work.stages) scope.stages.add(staged);
      if (work.pushes) scope.pushes = true;
      scope.sidePushes.push(...work.sidePushes);
      for (const entry of work.elsewhere) {
        const key = `${entry.dir}\0${entry.clone ?? ''}`;
        if (!elsewhere.has(key)) elsewhere.set(key, { clone: entry.clone, dir: entry.dir, pushes: false, stages: new Set() });
        const found = elsewhere.get(key);
        for (const staged of entry.stages) found.stages.add(staged);
        if (entry.pushes) found.pushes = true;
      }
      commandSends(step.run, scope.sends);
      if (/\bgh\s+issue\s+create\b/.test(step.run)) scope.issues.push(onlyOnFailure(step.if) || onlyOnFailure(body.if));
      // A step whose working directory cannot be read as a repository path
      // names nothing Atlas can place, so its tokens are left unresolved.
      const dir = step['working-directory'] === undefined ? jobDir : cleanDir(step['working-directory']);
      if (dir == null) return;
      // Actions spells ${{ env.X }} out before the shell sees the step.
      const named = readCommands(expandEnv(step.run, lookup), dir, repo);
      for (const entry of named.runs.values()) {
        const key = `${entry.path}\0${job}`;
        const run = { ...entry, job };
        runs.set(key, runs.has(key) ? better(runs.get(key), run) : run);
      }
      for (const path of named.mentions) mentions.set(`${path}\0${job}`, { path, job });
    });
    if (!gate && scope.pushes) pushes = true;
    if (!gate) sidePushes.push(...scope.sidePushes);
  }

  const recorded = recordedRuns([...runs.values()]);
  const runKeys = new Set(recorded.all.map((run) => `${run.path}\0${run.job}`));
  const underRun = (path, job) => recorded.all.some((run) => run.job === job && run.directory && path.startsWith(run.path));
  const byPathThenJob = (a, b) => compare(a.path, b.path) || compare(a.job, b.job);
  const gated = [...gates.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([, entry]) => ({
      when: entry.when,
      jobs: [...entry.jobs].sort(),
      sends: sendKeys(finishSends(entry.sends, entry.issues, entry.texts)),
      stages: [...entry.stages].sort(),
      pushes: entry.pushes,
      ...pushedElsewhere(entry.pushes, entry.sidePushes, entry.sends),
    }))
    .filter((entry) => entry.sends.length > 0 || entry.stages.length > 0 || entry.pushes || entry.pushesForReview || entry.pushesTo);
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
    checksCount: recorded.checks,
    mentions: [...mentions.values()]
      .filter((mention) => !runKeys.has(`${mention.path}\0${mention.job}`) && !underRun(mention.path, mention.job))
      .sort(byPathThenJob),
    stages: [...stages].sort(),
    pushes,
    ...pushedElsewhere(pushes, sidePushes, sends),
    elsewhere: [...elsewhere.values()]
      .map((entry) => ({ clone: entry.clone, dir: entry.dir, pushes: entry.pushes, stages: [...entry.stages].sort() }))
      .sort((a, b) => compare(a.dir, b.dir) || compare(a.clone ?? '', b.clone ?? '')),
    sends: finishSends(sends, issues, texts),
    ...(gated.length > 0 ? { gated } : {}),
    ...(conditional.length > 0 ? { conditional: [...conditional].sort() } : {}),
    uses: [...uses].sort(),
  };
}

function emptySends() {
  return { publishesTo: new Set(), releases: false, deploysPages: false, opensPullRequests: false };
}

function finishSends(sends, issues, texts) {
  const joined = texts.join('\n');
  const publishesTo = [...sends.publishesTo].sort();
  return {
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
  };
}

// A gated job's sends as a list, the shape the page reads them back from.
function sendKeys(sends) {
  const keys = [];
  for (const repo of sends.dispatchesTo) keys.push(`dispatchesTo:${repo}`);
  for (const registry of sends.publishesTo) keys.push(`publishesTo:${registry}`);
  for (const flag of ['releases', 'deploysPages', 'opensIssues', 'opensIssuesOnFailure', 'opensPullRequests']) if (sends[flag]) keys.push(flag);
  return keys;
}

/**
 * The trigger a job-level if: holds the job to, when it names the event or
 * the ref: github.event_name == 'push', github.ref == 'refs/heads/main',
 * startsWith(github.ref, 'refs/tags/'), joined by &&. An event it is held
 * off, github.event_name != 'pull_request' or !(github.event_name ==
 * 'pull_request'), leaves every other trigger of the workflow: when those are
 * one event (a run by hand aside), the gate is that trigger, a push to main,
 * and otherwise it is the events it excepts. Anything else in the condition
 * narrows the job further without changing which trigger it runs on; a
 * condition with || at its top, or one every trigger of the workflow already
 * meets, gates nothing.
 */
function jobGate(condition, triggers) {
  if (typeof condition !== 'string') return null;
  const expression = condition.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1').trim();
  if (topLevel(expression, '||').length > 1) return null;
  const gate = {};
  for (const raw of topLevel(expression, '&&')) {
    let part = raw;
    while (part.startsWith('(') && part.endsWith(')') && balanced(part.slice(1, -1))) part = part.slice(1, -1).trim();
    const event = /^github\.event_name\s*==\s*'([\w-]+)'$/.exec(part) ?? /^'([\w-]+)'\s*==\s*github\.event_name$/.exec(part);
    const held = heldOff(part);
    if (held) {
      gate.except = [...new Set([...(gate.except ?? []), held])].sort();
      continue;
    }
    const branch = /^github\.ref\s*==\s*'refs\/heads\/([^']+)'$/.exec(part) ?? /^'refs\/heads\/([^']+)'\s*==\s*github\.ref$/.exec(part);
    if (event) gate.event = event[1];
    else if (branch) gate.branches = [...new Set([...(gate.branches ?? []), branch[1]])].sort();
    else if (/^startsWith\(\s*github\.ref\s*,\s*'refs\/tags\/[^']*'\s*\)$/.test(part) || /^github\.ref_type\s*==\s*'tag'$/.test(part)) {
      gate.event = 'push';
      gate.tags = true;
    }
  }
  if (gate.except) settleExcept(gate, triggers);
  if (Object.keys(gate).length === 0) return null;
  return triggers.length > 0 && triggers.every((trigger) => meets(trigger, gate)) ? null : gate;
}

// github.event_name != 'x', 'x' != github.event_name, or !(github.event_name == 'x').
function heldOff(part) {
  const direct = /^github\.event_name\s*!=\s*'([\w-]+)'$/.exec(part) ?? /^'([\w-]+)'\s*!=\s*github\.event_name$/.exec(part);
  if (direct) return direct[1];
  if (!part.startsWith('!')) return null;
  let inner = part.slice(1).trim();
  while (inner.startsWith('(') && inner.endsWith(')') && balanced(inner.slice(1, -1))) inner = inner.slice(1, -1).trim();
  const negated = /^github\.event_name\s*==\s*'([\w-]+)'$/.exec(inner) ?? /^'([\w-]+)'\s*==\s*github\.event_name$/.exec(inner);
  return negated ? negated[1] : null;
}

// What an excepted event leaves is the gate, when it is one trigger's worth.
function settleExcept(gate, triggers) {
  if (gate.event) {
    delete gate.except;
    return;
  }
  const left = triggers.filter((trigger) => !gate.except.includes(trigger.event) && trigger.event !== 'workflow_dispatch');
  const events = [...new Set(left.map((trigger) => trigger.event))];
  if (events.length !== 1) return;
  const [only] = events;
  delete gate.except;
  gate.event = only;
  if (only !== 'push') return;
  const tagged = left.every((trigger) => (trigger.tags?.length ?? 0) > 0 && !((trigger.branches?.length ?? 0) > 0));
  if (tagged) {
    gate.tags = true;
    return;
  }
  const branches = left.map((trigger) => trigger.branches ?? []);
  if (branches.every((list) => list.length > 0)) gate.branches = [...new Set([...(gate.branches ?? []), ...branches.flat()])].sort();
}

function meets(trigger, gate) {
  if (gate.except && gate.except.includes(trigger.event)) return false;
  if (gate.event && trigger.event !== gate.event) return false;
  if (gate.tags && !((trigger.tags?.length ?? 0) > 0 && !((trigger.branches?.length ?? 0) > 0))) return false;
  if (gate.branches && !((trigger.branches?.length ?? 0) > 0 && trigger.branches.every((branch) => gate.branches.includes(branch)))) return false;
  return true;
}

/**
 * The runs a door records, sorted by path then job. A file a tool's patterns
 * matched under a directory the same job already runs is not listed again,
 * since the directory stands for it, unless the directory is only checked
 * and the file is run: a linter over scripts/ does not stand for the script
 * a test runner executes. The list keeps RUNS_RECORDED paths:
 * every path the commands name first, then directories a tool's patterns
 * filled, then the files they matched, taken one from each directory in
 * turn so every directory a tool ran keeps a file and the reach walked from
 * the list reaches every part the door runs. `count` is how many distinct
 * paths there are before that cap, so a door that runs a thousand test files
 * says so without carrying them all, and never loses the script it names.
 * `checks` is how many of those paths are only checked, never run.
 */
function recordedRuns(entries) {
  const directories = entries.filter((entry) => entry.directory);
  const covered = (entry) => entry.matched && directories.some((dir) => (
    dir.job === entry.job && entry.path !== dir.path && entry.path.startsWith(dir.path)
    && (dir.runKind !== 'checks' || entry.runKind === 'checks')
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
  const executed = new Set(all.filter((entry) => entry.runKind !== 'checks').map((entry) => entry.path));
  const paths = [...rank.keys()].sort((a, b) => rank.get(a) - rank.get(b) || (turn.get(a) ?? 0) - (turn.get(b) ?? 0)
    || Number(!executed.has(a)) - Number(!executed.has(b)) || compare(a, b));
  const shown = new Set(paths.slice(0, RUNS_RECORDED));
  return { all, kept: all.filter((entry) => shown.has(entry.path)), count: paths.length, checks: paths.filter((path) => !executed.has(path)).length };
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

function expandEnv(text, lookup) {
  return text.replace(/\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole, name) => lookup(name) ?? whole);
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

// Words that open a shell command line without being the command.
const SHELL_KEYWORDS = new Set(['if', 'elif', 'then', 'else', 'while', 'until', 'do', 'exec', 'time', '!']);
const GIT_VALUE_FLAGS = new Set(['-c', '--git-dir', '--work-tree', '--namespace']);
const CLONE_VALUE_FLAGS = new Set(['-b', '--branch', '--depth', '-o', '--origin', '--reference', '-c', '--config', '--filter', '-j', '--jobs', '--separate-git-dir', '--template', '-u', '--upload-pack', '--shallow-since', '--shallow-exclude']);

/**
 * What a step does with git, and where. Each command runs in a place: this
 * repository (at a tracked directory of it) or somewhere else, a clone of
 * another repository or a directory this map cannot name. cd, pushd and popd
 * move the step between places, git -C names one for a single command, and
 * git clone and gh repo clone record which repository a directory holds. What
 * git add stages and whether git pushes are kept apart by place: a commit in
 * another repository's clone is never a stage of this one. A variable in a
 * path is spelled out from an assignment earlier in the same step, then the
 * step's, the job's and the workflow's env; a staged path whose variable is
 * set at run time stays as written, and the page says so.
 *
 * A push to a branch other than the default one, named in its refspec or
 * made by an earlier git checkout -b or git switch -c in the job, is a push
 * for review: the commit reaches main only through a pull request, so it is
 * kept apart from a push that lands there.
 *
 * @returns {{ stages: string[], pushes: boolean, sidePushes: Array<{ branch: string|null, made: boolean }>, elsewhere: Array<{ dir: string, clone: string|null, stages: string[], pushes: boolean }> }}
 */
function gitWork(text, lookup, start, clones, repo, branch = { made: false, name: null }) {
  const out = { stages: [], pushes: false, sidePushes: [], elsewhere: [] };
  const assigned = new Map();
  const value = (name) => (assigned.has(name) ? assigned.get(name) : lookup(name));
  let place = start;
  const stack = [];
  const away = (at) => {
    let entry = out.elsewhere.find((item) => item.dir === at.dir && item.clone === at.clone);
    if (!entry) {
      entry = { dir: at.dir, clone: at.clone, stages: [], pushes: false };
      out.elsewhere.push(entry);
    }
    return entry;
  };
  for (const tokens of commandLines(text)) {
    if (tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token))) {
      for (const token of tokens) {
        const eq = token.indexOf('=');
        const assignedValue = token.slice(eq + 1);
        assigned.set(token.slice(0, eq), assignedValue.includes('$') ? null : assignedValue);
      }
      continue;
    }
    let first = 0;
    while (first < tokens.length && (SHELL_KEYWORDS.has(tokens[first]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[first]))) first += 1;
    const words = tokens.slice(first);
    const [command, ...args] = words;
    if (command === 'cd' || command === 'pushd') {
      if (command === 'pushd') stack.push(place);
      const target = args.find((arg) => !arg.startsWith('-'));
      // A bare cd goes home, which is no directory of this repository.
      place = target == null ? { here: false, dir: '~', clone: null } : placeOf(place, target, clones, repo, value);
      continue;
    }
    if (command === 'popd') {
      if (stack.length > 0) place = stack.pop();
      continue;
    }
    const clone = clonedInto(words, value);
    if (clone) {
      clones.set(placeOf(place, clone.dir, clones, repo, value).dir, clone.repository);
      continue;
    }
    if (command !== 'git') continue;
    let at = place;
    let i = 1;
    for (; i < words.length && words[i].startsWith('-'); i += 1) {
      if (words[i] === '-C' && i + 1 < words.length) at = placeOf(at, words[++i], clones, repo, value);
      else if (GIT_VALUE_FLAGS.has(words[i])) i += 1;
    }
    const sub = words[i];
    if ((sub === 'checkout' || sub === 'switch') && at.here) {
      const made = madeBranch(words.slice(i + 1), value);
      if (made != null) {
        branch.made = !DEFAULT_BRANCHES.has(made);
        branch.name = branch.made && !made.includes('$') ? made : null;
      }
    }
    if (sub === 'push') {
      const side = at.here ? sidePush(words.slice(i + 1), value, branch) : null;
      if (!at.here) away(at).pushes = true;
      else if (side) out.sidePushes.push(side);
      else out.pushes = true;
    }
    if (sub !== 'add') continue;
    for (const token of words.slice(i + 1)) {
      if (token.startsWith('-')) continue;
      const staged = substitute(token, value);
      if (!at.here) away(at).stages.push(staged);
      // A path staged from a directory of this repository is that directory's.
      else out.stages.push(at.dir && !staged.includes('$') ? posix.normalize(`${at.dir}/${staged}`) : staged);
    }
  }
  for (const entry of out.elsewhere) entry.stages = [...new Set(entry.stages)];
  return out;
}

const DEFAULT_BRANCHES = new Set(['main', 'master']);
const PUSH_VALUE_FLAGS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

// The branch git checkout -b X, -B X, --orphan X or git switch -c X, -C X
// makes, spelled out where its variable is known; null when the command
// makes none.
function madeBranch(args, lookup) {
  for (let i = 0; i < args.length; i += 1) {
    if (['-b', '-B', '--orphan', '-c', '-C', '--create', '--force-create'].includes(args[i])) return args[i + 1] == null ? null : substitute(args[i + 1], lookup);
  }
  return null;
}

/**
 * Where a push goes when it is not main: the branch its refspecs name, all
 * other than the default one, or the branch the job made when it pushes that
 * (no refspec, HEAD, or a refspec set at run time), with whether the job made
 * it. null for a push that may land on main: one to main, to tags, of
 * everything, or of a refspec set at run time on a job that made no branch.
 *
 * @returns {{ branch: string|null, made: boolean } | null}
 */
function sidePush(args, lookup, branch) {
  if (args.includes('--tags') || args.includes('--all') || args.includes('--mirror')) return null;
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (PUSH_VALUE_FLAGS.has(args[i])) i += 1;
      continue;
    }
    positional.push(args[i]);
  }
  const refspecs = positional.slice(1);
  const made = { branch: branch.name, made: true };
  if (refspecs.length === 0) return branch.made ? made : null;
  const targets = [];
  for (const raw of refspecs) {
    const spec = substitute(raw, lookup).replace(/^\+/, '');
    const target = (spec.includes(':') ? spec.slice(spec.indexOf(':') + 1) : spec).replace(/^refs\/heads\//, '');
    if (target === 'HEAD' || target.includes('$')) {
      if (!branch.made) return null;
      targets.push(made);
    } else if (target.startsWith('refs/tags/') || DEFAULT_BRANCHES.has(target)) return null;
    else targets.push({ branch: target, made: branch.made && target === branch.name });
  }
  return targets.length === 1 ? targets[0] : { branch: null, made: targets.every((target) => target.made) };
}

/**
 * What a door or a gated job's pushes to other branches than main say. A push
 * of a branch the job made, or with a pull request opened for it, is a push
 * for review: the commit reaches main only when a person merges it. One to a
 * branch kept for its own sake (a render branch, a baseline) names that
 * branch. Either is said only when nothing the door does pushes to main.
 */
function pushedElsewhere(pushes, sidePushes, sends) {
  if (pushes || sidePushes.length === 0) return {};
  if (sends.opensPullRequests || sidePushes.some((push) => push.made)) return { pushesForReview: true };
  return { pushesTo: [...new Set(sidePushes.map((push) => push.branch ?? '$'))].sort() };
}

/**
 * Where a directory a step moves to is. A tracked directory of this
 * repository, or its root, is here. A directory that holds a clone, or lies
 * inside one, is that clone. Anything else (a path outside the workspace, a
 * directory the repository does not track, a path set at run time) is
 * somewhere this map cannot name.
 */
function placeOf(from, raw, clones, repo, lookup) {
  if (raw == null || raw === '') return from;
  const text = substitute(String(raw), lookup).replaceAll('\\', '/');
  const unresolved = text.includes('$');
  const absolute = text.startsWith('/') || text.startsWith('~') || /^[A-Za-z]:\//.test(text);
  let dir;
  if (unresolved || absolute) dir = unresolved ? text : posix.normalize(text).replace(/\/+$/, '');
  else if (!from.here) dir = posix.normalize(`${from.dir}/${text}`).replace(/\/+$/, '');
  else dir = posix.normalize(from.dir ? `${from.dir}/${text}` : text).replace(/\/+$/, '');
  if (dir === '.') dir = '';
  for (const [cloneDir, repository] of clones) {
    if (dir === cloneDir || dir.startsWith(`${cloneDir}/`)) return { here: false, dir: cloneDir, clone: repository };
  }
  if (!from.here && !unresolved && !absolute) return { here: false, dir: from.dir, clone: from.clone };
  if (unresolved || absolute || dir === '..' || dir.startsWith('../')) return { here: false, dir, clone: null };
  if (dir === '' || repo.dirs.has(dir)) return { here: true, dir };
  return { here: false, dir, clone: null };
}

/**
 * The repository a git clone or gh repo clone command clones and the
 * directory it clones into, or null for any other command. A GitHub URL is
 * named owner/name, and credentials in a URL are never kept.
 */
function clonedInto(tokens, lookup) {
  let positional;
  if (tokens[0] === 'git' && tokens[1] === 'clone') {
    positional = [];
    for (let i = 2; i < tokens.length; i += 1) {
      if (tokens[i] === '--') {
        positional.push(...tokens.slice(i + 1));
        break;
      }
      if (tokens[i].startsWith('-')) {
        if (CLONE_VALUE_FLAGS.has(tokens[i])) i += 1;
        continue;
      }
      positional.push(tokens[i]);
    }
  } else if (tokens[0] === 'gh' && tokens[1] === 'repo' && tokens[2] === 'clone') {
    const end = tokens.indexOf('--');
    positional = tokens.slice(3, end === -1 ? tokens.length : end).filter((token) => !token.startsWith('-'));
  } else return null;
  if (positional.length === 0) return null;
  const repository = repositoryName(substitute(positional[0], lookup));
  const fallback = repository ? repository.slice(repository.lastIndexOf('/') + 1).replace(/\.git$/, '') : null;
  const dir = positional[1] ?? fallback;
  return dir == null ? null : { repository, dir };
}

function repositoryName(text) {
  let url = text.replace(/^[a-z+]+:\/\/[^@/]*@/i, (whole) => whole.replace(/\/\/[^@/]*@/, '//')).replace(/^git@github\.com:/, 'https://github.com/');
  url = url.replace(/\.git$/, '').replace(/\/+$/, '');
  if (url.includes('${{') || url.includes('$')) return null;
  const github = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(url);
  if (github) return `${github[1]}/${github[2]}`;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url)) return url;
  return url.includes('://') ? url : null;
}

// actions/checkout of another repository into a directory of the workspace.
function otherCheckout(action, input) {
  if (action !== 'actions/checkout' || !isMapping(input)) return null;
  if (typeof input.repository !== 'string' || input.repository.includes('${{')) return null;
  if (typeof input.path !== 'string' || input.path.trim() === '') return null;
  const dir = cleanDir(input.path);
  return dir ? { dir, repository: repositoryName(input.repository) } : null;
}

function rawWorkingDirectory(defaults) {
  return isMapping(defaults) && isMapping(defaults.run) && typeof defaults.run['working-directory'] === 'string' ? defaults.run['working-directory'] : null;
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
