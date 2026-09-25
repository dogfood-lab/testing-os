import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import picomatch from 'picomatch';
import { parse } from 'yaml';
import { better, cleanDir, commandLines, readCommands, readContainer, readProgram, repositoryView, RUNS_RECORDED } from './commands.js';
import { godotProjects } from './godot.js';
import { isTestFile } from './landings.js';
import { storedText } from './text.js';

const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const TRIGGER_LISTS = ['paths', 'paths-ignore', 'branches', 'tags', 'types', 'workflows'];

// Words that start the program a command line runs without being it.
const RUNNER_WORDS = new Set(['sudo', 'env', 'time', 'exec', 'command', 'nohup']);
const NPX_VALUE_FLAGS = new Set(['-p', '--package', '-c', '--call']);
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
  // On a release event it uploads to the release that started the run; on
  // any other it creates one. What it uploads is read by shipBuilds.
  ['softprops/action-gh-release', (sends, step, onRelease) => { if (!onRelease) sends.releases = true; }],
  ['ncipollo/release-action', (sends) => { sends.releases = true; }],
  ['actions/deploy-pages', (sends) => { sends.deploysPages = true; }],
  ['peaceiris/actions-gh-pages', (sends) => { sends.deploysPages = true; }],
  ['peter-evans/create-pull-request', (sends) => { sends.opensPullRequests = true; }],
  // A script github-script runs opens a pull request its Octokit creates.
  ['actions/github-script', (sends, step) => {
    const script = typeof step.with?.script === 'string' ? step.with.script : '';
    if (/\bpulls\.create\s*\(/.test(script)) sends.opensPullRequests = true;
  }],
];

/**
 * Read every tracked workflow under .github/workflows and describe it as a
 * door: what starts it, what it runs, what it may touch and what it sends.
 * A workflow that does not parse is still a door; it is recorded as such and
 * the rest of the map is unaffected.
 *
 * @param {{ repoPath: string, tracked: Set<string>, spawned?: Map<string, string[]>, builtFrom?: (path: string) => string|null, unitTests?: Set<string> }} input
 *   spawned holds, per JavaScript or TypeScript file, the command lines it
 *   hands to a child process (core/spawned.js); builtFrom is the source a
 *   build output is compiled from; unitTests is every Rust file holding its
 *   own unit tests, which cargo test runs
 */
export function mapDoors({ repoPath, tracked, spawned, commands = [], builtFrom, emitted, unitTests, discovered }) {
  const repo = repositoryView({ repoPath, tracked, spawned, commands, builtFrom, emitted, unitTests, discovered });
  const workflows = [...tracked].filter(isWorkflow).sort();
  const doors = workflows.map((file) => readDoor(repoPath, file, repo));
  // An action this repository defines that none of its workflows uses is
  // one it ships for other repositories: a root action.yml, or one under
  // .github/actions/ that no workflow names as ./.github/actions/<name>.
  const used = new Set();
  for (const file of workflows) {
    let text = '';
    try {
      text = readFileSync(join(repoPath, file), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(/\buses:\s*['"]?\.\/([^'"\s@#]+)/g)) used.add(match[1].replace(/\/+$/, '').replace(/\/action\.ya?ml$/, ''));
  }
  const actions = [...tracked].filter((path) => /^action\.ya?ml$/.test(path) || /^\.github\/actions\/[^/]+\/action\.ya?ml$/.test(path))
    .filter((path) => path.includes('/') ? !used.has(posix.dirname(path)) : true)
    .sort();
  for (const file of actions) doors.push(readDoor(repoPath, file, repo, actionAsWorkflow));
  return doors;
}

/**
 * An action a repository ships, read as a workflow of one job: a composite
 * action's steps, or a JavaScript action's main run with node. Its steps
 * run in the caller's workspace, so a path is this repository's only when
 * spelled through github.action_path, which is the action's directory. An
 * action has no trigger of its own; what it does is what other
 * repositories' workflows run.
 */
function actionAsWorkflow(doc, file) {
  const dir = posix.dirname(file);
  const here = dir === '.' ? '.' : `./${dir}`;
  const name = typeof doc.name === 'string' && doc.name.trim() !== '' ? doc.name : (dir === '.' ? 'action' : posix.basename(dir));
  const runs = isMapping(doc.runs) ? doc.runs : {};
  const through = (text) => (typeof text === 'string' ? text.replace(/\$\{\{\s*github\.action_path\s*\}\}/g, here) : text);
  let steps = [];
  if (runs.using === 'composite' && Array.isArray(runs.steps)) {
    steps = runs.steps.filter(isMapping).map((step) => {
      const env = isMapping(step.env) ? step.env : {};
      let run = through(step.run);
      for (const [variable, value] of Object.entries(env)) {
        if (typeof run !== 'string' || typeof value !== 'string' || !/^\s*\$\{\{\s*github\.action_path\s*\}\}\s*$/.test(value)) continue;
        run = run.replace(new RegExp(`\\$\\{${variable}\\}|\\$${variable}\\b`, 'g'), here);
      }
      return { ...step, ...(run !== undefined ? { run } : {}), ...(step['working-directory'] !== undefined ? { 'working-directory': through(step['working-directory']) } : {}) };
    });
  } else if (typeof runs.using === 'string' && /^node\d+$/.test(runs.using) && typeof runs.main === 'string') {
    steps = [{ name: 'main', run: `node ${posix.join(here, runs.main)}` }];
  }
  return { name, on: {}, jobs: { action: { steps } } };
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
export function mapCommandDoors({ repoPath, tracked, spawned, commands, builtFrom, emitted, unitTests, discovered }) {
  const repo = repositoryView({ repoPath, tracked, spawned, commands, builtFrom, emitted, unitTests, discovered });
  return commands.map((command) => {
    const programs = command.path == null ? [] : (command.paths ?? [command.path]);
    const read = new Map();
    for (const path of programs) {
      for (const [key, run] of readProgram(path, repo)) read.set(key, read.has(key) ? better(read.get(key), run) : run);
    }
    const recorded = recordedRuns([...read.values()]);
    return {
      ...(command.unplaced ? { unplaced: command.unplaced } : {}),
      // Read by index.js settleInstalled, then dropped.
      ...(command.privateMember ? { privateMember: true, declared: command.declared } : {}),
      ...(command.kind === 'package' ? { exported: programs } : {}),
      // What an import of the bare name loads, among every file it exports.
      ...(command.kind === 'package' && command.path != null ? { entry: command.path } : {}),
      // What kind of program people install, past a command they type.
      ...(command.app ? { app: command.app } : {}),
      ...(command.example ? { example: true } : {}),
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
  const sent = workflows.flatMap(sendsOf);
  // A VS Code extension is installed from a marketplace, never imported from
  // npm, so it is published when a door sends it to one.
  if (manifest?.engines != null && typeof manifest.engines === 'object' && manifest.engines.vscode != null) {
    const to = [...new Set(sent.flatMap((sends) => sends.publishesTo).filter((registry) => MARKETPLACES.includes(registry)))].sort();
    for (const door of doors) {
      if (door.kind !== 'package') continue;
      door.extension = true;
      if (to.length > 0) door.publishedTo = to;
      else door.unpublished = true;
    }
    return;
  }
  // An npm publish that names only other packages (a workspace member's
  // directory) does not publish this one.
  const toNpm = sent.some((sends) => sends.publishesTo.includes('npm') && rootSent(sends.packages));
  const declared = manifest?.private === false
    && workflows.some((door) => /publish|release/i.test(`${posix.basename(door.file)} ${door.name}`));
  if (toNpm || declared) return;
  for (const door of doors) if (door.kind === 'package') door.unpublished = true;
}

const MARKETPLACES = ['open-vsx', 'vscode-marketplace'];

// A door's sends, and each gated job's, read back from the keys they are kept as.
function sendsOf(door) {
  const out = [{ publishesTo: door.sends.publishesTo, packages: door.sends.packages ?? [] }];
  for (const entry of door.gated ?? []) {
    const publishesTo = entry.sends.filter((key) => key.startsWith('publishesTo:')).map((key) => key.slice('publishesTo:'.length));
    const packages = entry.sends.filter((key) => key.startsWith('packages:')).map((key) => JSON.parse(key.slice('packages:'.length)));
    out.push({ publishesTo, packages });
  }
  return out;
}

// A publish whose package this map could not name may be the root's.
function rootSent(packages) {
  const npm = packages.filter((entry) => entry.registry === 'npm');
  return npm.length === 0 || npm.some((entry) => entry.dir === '');
}

export function isWorkflow(path) {
  return WORKFLOW.test(path);
}

// A local file a workflow names by uses: ./path, parsed, or null.
function localYaml(repoPath, repo, path) {
  const clean = String(path).replace(/^\.\//, '').replace(/\/+$/, '');
  for (const candidate of clean.endsWith('.yml') || clean.endsWith('.yaml') ? [clean] : [`${clean}/action.yml`, `${clean}/action.yaml`]) {
    if (!repo.tracked.has(candidate)) continue;
    try {
      const doc = parse(storedText(readFileSync(join(repoPath, candidate), 'utf8')));
      return isMapping(doc) ? doc : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * A workflow's jobs with each job that calls a reusable workflow of this
 * repository (uses: ./.github/workflows/ci.yml) replaced by that
 * workflow's jobs, named caller/callee, under the caller's if when they
 * have none of their own: the calling door runs them. One level deep.
 */
function localJobs(repoPath, repo, jobs) {
  const out = {};
  for (const [job, body] of Object.entries(jobs)) {
    const called = isMapping(body) && typeof body.uses === 'string' && body.uses.startsWith('./') ? localYaml(repoPath, repo, body.uses) : null;
    if (!called || !isMapping(called.jobs)) {
      out[job] = body;
      continue;
    }
    for (const [inner, innerBody] of Object.entries(called.jobs)) {
      if (!isMapping(innerBody) || typeof innerBody.uses === 'string') continue;
      out[`${job}/${inner}`] = body.if != null && innerBody.if == null ? { ...innerBody, if: body.if } : innerBody;
    }
  }
  return out;
}

/**
 * A job's steps with each step that uses a composite action of this
 * repository (uses: ./.github/actions/clean-room) replaced by the action's
 * own steps, under the step's if when they have none: the job runs them.
 * Two levels deep.
 */
function localSteps(repoPath, repo, steps, depth = 0) {
  const out = [];
  for (const step of steps) {
    const action = isMapping(step) && typeof step.uses === 'string' && step.uses.startsWith('./') && depth < 2 ? localYaml(repoPath, repo, step.uses) : null;
    const inner = action?.runs?.using === 'composite' && Array.isArray(action.runs.steps) ? action.runs.steps : null;
    if (!inner) {
      out.push(step);
      continue;
    }
    const held = inner.map((item) => (isMapping(item) && step.if != null && item.if == null ? { ...item, if: step.if } : item));
    out.push(...localSteps(repoPath, repo, held, depth + 1));
  }
  return out;
}

function readDoor(repoPath, file, repo, asWorkflow = null) {
  const fallback = posix.basename(file).replace(/\.ya?ml$/, '');
  let text;
  let doc;
  try {
    text = storedText(readFileSync(join(repoPath, file), 'utf8'));
    doc = parse(text);
  } catch {
    return { file, name: fallback, parseError: true };
  }
  if (!isMapping(doc)) return { file, name: fallback, parseError: true };
  if (asWorkflow) return { ...readWorkflow(repoPath, file, repo, asWorkflow(doc, file), fallback, text), kind: 'action' };
  return readWorkflow(repoPath, file, repo, doc, fallback, text);
}

function readWorkflow(repoPath, file, repo, doc, fallback, text) {
  const permissions = new Set(permissionList(doc.permissions));
  const commands = [];
  const uses = new Set();
  const runs = new Map();
  const mentions = new Map();
  // Places of this repository a command run from another checkout is handed
  // to write, by an output flag (index.js attachLandings).
  const handed = new Set();
  // The directories below the root holding a package.json that a step works
  // in, whose commands index.js makes doors when no workspace does.
  const workedIn = new Set();
  const stages = new Set();
  let pushes = false;
  const sidePushes = [];
  // What a shell's expansion of an unquoted glob leaves out, by directory
  // and platform, across the door's steps.
  const missed = new Map();
  const elsewhere = new Map();
  const sends = emptySends();
  const issues = [];
  const texts = [];
  // What a job gated to one trigger does is kept apart, by its gate.
  const gates = new Map();
  // The jobs that run only when an earlier job's output says so.
  const conditional = [];
  // What each job builds, uploads and downloads, for what a release ships.
  const shipping = [];
  const triggers = triggerList(doc.on);
  const scopeOfGate = (when) => {
    const key = canonical(when);
    if (!gates.has(key)) gates.set(key, { when, jobs: [], sends: emptySends(), issues: [], texts: [], stages: new Set(), pushes: false, sidePushes: [] });
    return gates.get(key);
  };
  const workflowDir = workingDirectory(doc.defaults);
  const workflowEnv = envOf(doc.env);
  for (const [job, body] of Object.entries(localJobs(repoPath, repo, isMapping(doc.jobs) ? doc.jobs : {}))) {
    if (!isMapping(body)) continue;
    const gate = jobGate(body.if, triggers);
    if (typeof body.if === 'string' && /\bneeds\.[\w-]+\.outputs\b/.test(body.if)) conditional.push(job);
    if (gate && !gates.has(canonical(gate))) gates.set(canonical(gate), { when: gate, jobs: [], sends: emptySends(), issues: [], texts: [], stages: new Set(), pushes: false, sidePushes: [] });
    if (gate) gates.get(canonical(gate)).jobs.push(job);
    const jobScope = gate ? gates.get(canonical(gate)) : { sends, issues, texts, stages, pushes: false, sidePushes: [] };
    // A step held to a trigger of its own (if: github.ref_type == 'tag') is
    // kept apart the way a gated job is, under the gate the two make together.
    const scopeFor = (when) => {
      if (when === gate) return jobScope;
      const key = canonical(when);
      if (!gates.has(key)) gates.set(key, { when, jobs: [], sends: emptySends(), issues: [], texts: [], stages: new Set(), pushes: false, sidePushes: [] });
      const entry = gates.get(key);
      if (!entry.jobs.includes(job)) entry.jobs.push(job);
      return entry;
    };
    // The branch a job has moved onto, which later steps push.
    const branch = { made: false, name: null };
    for (const permission of permissionList(body.permissions)) permissions.add(permission);
    const jobDir = workingDirectory(body.defaults) ?? workflowDir ?? '';
    const jobEnv = envOf(body.env);
    const platforms = jobPlatforms(body);
    const steps = localSteps(repoPath, repo, Array.isArray(body.steps) ? body.steps : []);
    // The clones a job makes, by the directory they are made in: another
    // repository's checkout, read from actions/checkout, and what a step
    // clones. A step that works inside one works on that repository.
    const clones = new Map();
    const rawJobDir = rawWorkingDirectory(body.defaults) ?? rawWorkingDirectory(doc.defaults) ?? '';
    // A job that checks this repository out into a directory of the
    // workspace (actions/checkout with a path and no other repository) works
    // on it only from inside that directory: a step there is at the
    // repository's root, one anywhere else is outside it.
    const selfPath = ownCheckoutPath(steps);
    const own = (raw) => {
      if (selfPath == null) return raw;
      const clean = cleanDir(String(raw ?? ''));
      if (clean == null || clean === '' || !(clean === selfPath || clean.startsWith(`${selfPath}/`))) return null;
      return clean === selfPath ? '' : clean.slice(selfPath.length + 1);
    };
    // The run texts of the job's steps so far, where a later step's run-time
    // directory is assigned.
    const jobTexts = [];
    const shipped = { job, body, platforms, gate, builds: new Set(), targets: new Set(), artifacts: [], downloads: false, uploads: [], packs: false };
    shipping.push(shipped);
    steps.forEach((step, index) => {
      if (!isMapping(step)) return;
      const when = joinGates(gate, jobGate(step.if, triggers));
      const scope = scopeFor(when);
      const held = when ? { when } : {};
      if (typeof step.uses === 'string') {
        const action = step.uses.replace(/@.*$/, '');
        uses.add(action);
        // An action whose push input is an expression pushes on the runs the
        // expression holds on, read as an if: is.
        const pushWhen = typeof step.with?.push === 'string' && step.with.push.includes('${{') ? joinGates(when, jobGate(step.with.push, triggers)) : when;
        for (const [name, apply] of ACTION_SENDS) if (action === name || action.startsWith(`${name}/`)) apply(scopeFor(pushWhen).sends, step, onReleaseEvent(when, triggers));
        if (action === 'actions/upload-artifact') shipped.artifacts.push(...inputPaths(step.with?.path));
        if (action === 'actions/download-artifact') shipped.downloads = true;
        if (action === 'softprops/action-gh-release' && inputPaths(step.with?.files).length > 0) {
          shipped.uploads.push({ when, files: inputPaths(step.with.files), creates: !onReleaseEvent(when, triggers) });
        }
        if (action === 'actions/upload-release-asset') shipped.uploads.push({ when, files: inputPaths(step.with?.asset_path), creates: false });
        const checkout = otherCheckout(action, step.with);
        if (checkout) clones.set(checkout.dir, checkout.repository);
        // The action builds the image from the context and file it is handed.
        if (action === 'docker/build-push-action' || action === 'redhat-actions/buildah-build') {
          const context = typeof step.with?.context === 'string' && !step.with.context.includes('${{') ? step.with.context : '.';
          const dockerfile = typeof step.with?.file === 'string' && !step.with.file.includes('${{') ? step.with.file : null;
          const dir = workingDirectory(body.defaults) ?? workflowDir ?? '';
          for (const entry of readContainer(context, dockerfile, dir, repo).values()) {
            const key = `${entry.path}\0${job}`;
            const run = { ...entry, job, ...held };
            runs.set(key, runs.has(key) ? mergeRun(runs.get(key), run) : run);
          }
        }
      }
      if (typeof step.run !== 'string') return;
      const name = typeof step.name === 'string' && step.name.trim() !== '' ? step.name : String(index);
      scope.texts.push(step.run);
      const stepEnv = envOf(step.env);
      const lookup = (variable) => [stepEnv, jobEnv, workflowEnv].find((env) => env.has(variable))?.get(variable) ?? null;
      // A working directory spelled with a matrix value or a dispatch input
      // (src/${{ matrix.project }}, examples/${{ inputs.tool }}) is each
      // directory it can be: the matrix's values, the input's options, or
      // every tracked directory its glob matches.
      const stepDirs = expandedDirs(step['working-directory'], body, doc.on, repo);
      const jobDirs = step['working-directory'] === undefined ? expandedDirs(rawJobDir === '' ? undefined : rawJobDir, body, doc.on, repo) : null;
      const expanded = stepDirs ?? jobDirs;
      const rawDirs = expanded ?? [step['working-directory'] ?? rawJobDir];
      // The directory the step's shell starts in, when it is this repository's
      // and one, for the files its own redirects write (landings.js
      // attachLandings).
      const firstDir = own(rawDirs[0]);
      const firstStart = firstDir == null ? { here: false } : placeOf({ here: true, dir: '' }, firstDir, clones, repo, lookup);
      commands.push({ job, step: name, text: step.run, ...(firstStart.here && rawDirs.length === 1 ? { dir: firstStart.dir } : {}) });
      for (const rawDir of rawDirs) {
        const ownDir = own(rawDir);
        const start = ownDir == null ? { here: false, dir: String(rawDir ?? ''), clone: null } : placeOf({ here: true, dir: '' }, ownDir, clones, repo, lookup);
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
        const place = { raw: ownDir ?? rawDir, jobTexts, repo, tagged: triggers.some((trigger) => (trigger.tags?.length ?? 0) > 0) };
        commandSends(expandEnv(step.run, lookup), scope.sends, place);
        // A step outside this repository's checkout names this repository by
        // a path through that checkout: stage/.github/pins.env from the
        // workspace, ../stage/fixtures from a sibling checkout.
        if (selfPath != null && ownDir == null) {
          const through = throughCheckout(expandEnv(step.run, lookup), String(rawDir ?? ''), selfPath, repo);
          for (const path of through.named) mentions.set(`${path}\0${job}`, { path, job });
          for (const path of through.written) handed.add(path);
        }
        // A step whose working directory cannot be read as a repository path
        // names nothing Atlas can place, so its tokens are left unresolved.
        const dir = selfPath != null ? ownDir : expanded ? cleanDir(rawDir) : step['working-directory'] === undefined ? jobDir : cleanDir(step['working-directory']);
        if (dir == null) continue;
        if (dir !== '' && repo.tracked.has(`${dir}/package.json`)) workedIn.add(dir);
        // Actions spells ${{ env.X }} out before the shell sees the step.
        const named = readCommands(expandEnv(step.run, lookup), dir, repo, platforms);
        for (const entry of named.shellMissed) {
          const key = `${entry.base}\0${entry.platform}`;
          const found = missed.get(key) ?? { base: entry.base, files: new Set(), platform: entry.platform, twoStars: false };
          for (const path of entry.files) found.files.add(path);
          found.twoStars ||= entry.twoStars;
          missed.set(key, found);
        }
        for (const entry of named.runs.values()) {
          const key = `${entry.path}\0${job}`;
          const run = { ...entry, job, ...held };
          runs.set(key, runs.has(key) ? mergeRun(runs.get(key), run) : run);
          if (entry.builds) shipped.builds.add(entry.path);
        }
        for (const path of named.mentions) mentions.set(`${path}\0${job}`, { path, job });
      }
      jobTexts.push(step.run);
      const released = releaseUploads(expandEnv(step.run, lookup));
      if (released) shipped.uploads.push({ when, files: released, creates: false });
      if (/\bmakeappx(?:\.exe)?["']?\s+pack\b/i.test(step.run)) shipped.packs = true;
      for (const target of buildTargets(expandEnv(step.run, lookup), body)) shipped.targets.add(target);
      if (/\bgh\s+issue\s+create\b/.test(step.run)) scope.issues.push(onlyOnFailure(step.if) || onlyOnFailure(body.if));
    });
    if (!gate && jobScope.pushes) pushes = true;
    if (!gate) sidePushes.push(...jobScope.sidePushes);
  }

  shipBuilds(shipping, runs, triggers, (when) => (when ? scopeOfGate(when) : { sends }));
  unionPathGates([...runs.values()], triggers);
  // The packages whose own test script a step runs, kept on the door so a
  // run reads the same whichever script reached it.
  const testScripts = [...new Set([...runs.values()].map((run) => run.testScript).filter((dir) => dir != null))].sort();
  for (const run of runs.values()) delete run.testScript;
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
    ...(missed.size > 0 ? { shellMissed: shellMissed(missed) } : {}),
    uses: [...uses].sort(),
    ...(handed.size > 0 ? { handedWrites: [...handed].sort() } : {}),
    ...(workedIn.size > 0 ? { workedIn: [...workedIn].sort() } : {}),
    ...(testScripts.length > 0 ? { testScripts } : {}),
    // Read by index.js markUnshipped, then dropped.
    publishedCrates: [sends, ...[...gates.values()].map((entry) => entry.sends)].flatMap((scope) => scope.crates),
  };
}

// The files a door's shell leaves out, a directory and platform at a time:
// how many, whether all are tests, and whether ** was the cause.
function shellMissed(missed) {
  return [...missed.values()]
    .map((entry) => ({
      base: entry.base,
      files: entry.files.size,
      platform: entry.platform,
      tests: [...entry.files].every(isTestFile),
      twoStars: entry.twoStars,
    }))
    .sort((a, b) => compare(a.base, b.base) || compare(a.platform, b.platform));
}

/**
 * The operating systems a job runs on, read from runs-on: a label, a list of
 * a self-hosted runner's labels, or a matrix axis the label names, whose
 * values and include entries are read. A label naming Windows or macOS is
 * that system; any other, ubuntu or a self-hosted one, is Linux, and so is a
 * runs-on this reader cannot resolve.
 */
function jobPlatforms(body) {
  const runsOn = body['runs-on'];
  const osOf = (label) => (/windows/i.test(label) ? 'windows' : /macos|mac-|osx/i.test(label) ? 'macos' : 'linux');
  const labels = [];
  if (typeof runsOn === 'string') {
    const axis = /\$\{\{\s*matrix\.([\w-]+)\s*\}\}/.exec(runsOn);
    if (axis) {
      const matrix = isMapping(body.strategy) && isMapping(body.strategy.matrix) ? body.strategy.matrix : {};
      const values = Array.isArray(matrix[axis[1]]) ? matrix[axis[1]] : [];
      for (const value of values) if (typeof value === 'string') labels.push(value);
      for (const entry of Array.isArray(matrix.include) ? matrix.include : []) {
        if (isMapping(entry) && typeof entry[axis[1]] === 'string') labels.push(entry[axis[1]]);
      }
    } else labels.push(runsOn);
  } else if (Array.isArray(runsOn)) {
    const all = runsOn.filter((label) => typeof label === 'string').join(' ');
    if (all !== '') labels.push(all);
  }
  const found = [...new Set(labels.map(osOf))].sort();
  return found.length > 0 ? found : ['linux'];
}


function emptySends() {
  return { publishesTo: new Set(), packages: new Map(), exports: new Set(), assets: new Set(), crates: [], releases: false, deploysPages: false, opensPullRequests: false };
}

function finishSends(sends, issues, texts) {
  const joined = texts.join('\n');
  const publishesTo = [...sends.publishesTo].sort();
  const packages = [...sends.packages.entries()].sort(([a], [b]) => compare(a, b)).map(([, entry]) => entry);
  const exports = [...sends.exports].sort();
  const assets = [...(sends.assets ?? [])].sort();
  return {
    dispatchesTo: [
      ...new Set([...joined.matchAll(/repos\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/dispatches\b/g)].map((m) => `${m[1]}/${m[2]}`)),
    ].sort(),
    ...(packages.length > 0 ? { packages } : {}),
    ...(exports.length > 0 ? { exports } : {}),
    ...(assets.length > 0 ? { assets } : {}),
    publishes: publishesTo.length > 0,
    publishesTo,
    releases: sends.releases,
    deploysPages: sends.deploysPages,
    opensIssues: issues.length > 0,
    opensIssuesOnFailure: issues.length > 0 && issues.every(Boolean),
    opensPullRequests: sends.opensPullRequests,
    ...(readsRepositories(joined) ? { readsRepositories: true } : {}),
  };
}

/**
 * Whether a gh api call reads repositories other than this one: an
 * organization's repository list, or a repository whose name the shell
 * fills in (repos/${ORG}/${repo}/readme), never github.repository, with no
 * method or field that makes it a write.
 */
function readsRepositories(text) {
  const own = /^\/?repos\/(?:\$\{\{\s*github\.repository\s*\}\}|\$\{?GITHUB_REPOSITORY\}?|\{owner\}\/\{repo\})(?:\/|$)/;
  const other = /^\/?(?:orgs\/[^/]+\/repos\b|repos\/[^/]+\/[^/]+)/;
  return commandLines(text).some((tokens) => {
    const at = tokens.findIndex((word, index) => word === 'api' && tokens[index - 1] === 'gh');
    if (at === -1) return false;
    const args = tokens.slice(at + 1);
    if (args.some((word, index) => ((word === '-X' || word === '--method') && !/^get$/i.test(args[index + 1] ?? '')) || /^--method=(?!get$)/i.test(word) || /^-[fF]$|^--(?:raw-)?field$|^--input$/.test(word))) return false;
    return args.some((word) => other.test(word) && !own.test(word) && (/^\/?orgs\//.test(word) || word.includes('$')));
  });
}

// A gated job's sends as a list, the shape the page reads them back from.
// A package it names is carried whole, as JSON after its key.
function sendKeys(sends) {
  const keys = [];
  for (const repo of sends.dispatchesTo) keys.push(`dispatchesTo:${repo}`);
  for (const registry of sends.publishesTo) keys.push(`publishesTo:${registry}`);
  for (const entry of sends.packages ?? []) keys.push(`packages:${JSON.stringify(entry)}`);
  for (const platform of sends.exports ?? []) keys.push(`exports:${platform}`);
  for (const asset of sends.assets ?? []) keys.push(`assets:${asset}`);
  for (const flag of ['releases', 'deploysPages', 'opensIssues', 'opensIssuesOnFailure', 'opensPullRequests', 'readsRepositories']) if (sends[flag]) keys.push(flag);
  return keys;
}

/**
 * The trigger a job-level or step-level if: holds work to, when it names the
 * event, the ref or an input a run by hand is given: github.event_name ==
 * 'push', github.ref == 'refs/heads/main', startsWith(github.ref,
 * 'refs/tags/'), github.ref_type == 'tag', inputs.dry_run, !inputs.dry_run,
 * joined by &&. An event it is held off, github.event_name != 'pull_request'
 * or !(github.event_name == 'pull_request'), leaves every other trigger of the
 * workflow: when those are one event (a run by hand aside), the gate is that
 * trigger, a push to main, and otherwise it is the events it excepts. An
 * input is set only on a run by hand, so one that must be true holds the work
 * to that run, and one that must be false holds only that run to it. Anything
 * else in a condition narrows the work further without changing which
 * trigger it runs on. A condition with || at its top is read one alternative
 * at a time, when every alternative is one of those shapes (see eitherGate);
 * one every trigger of the workflow already meets gates nothing.
 */
function jobGate(condition, triggers) {
  if (typeof condition !== 'string') return null;
  const expression = condition.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1').trim();
  const alternatives = topLevel(expression, '||');
  if (alternatives.length > 1) return eitherGate(alternatives, triggers);
  const gate = conjunctionGate(expression, triggers, false);
  if (Object.keys(gate).length === 0) return null;
  if (gate.inputs) return gate;
  if (gate.fork != null) return forkGate(gate, triggers);
  return triggers.length > 0 && triggers.every((trigger) => meets(trigger, gate)) ? null : gate;
}

const UNREAD_PART = Symbol('unread');

// One conjunction's gate. Read strictly, a part that is not an event, a ref
// or an input makes the whole alternative unreadable, since in an || it may
// hold on any trigger.
function conjunctionGate(expression, triggers, strict) {
  const gate = {};
  let whole = expression.trim();
  while (whole.startsWith('(') && whole.endsWith(')') && balanced(whole.slice(1, -1))) whole = whole.slice(1, -1).trim();
  for (const raw of topLevel(whole, '&&')) {
    let part = raw;
    while (part.startsWith('(') && part.endsWith(')') && balanced(part.slice(1, -1))) part = part.slice(1, -1).trim();
    const event = /^github\.event_name\s*==\s*'([\w-]+)'$/.exec(part) ?? /^'([\w-]+)'\s*==\s*github\.event_name$/.exec(part);
    const held = heldOff(part);
    if (held) {
      gate.except = [...new Set([...(gate.except ?? []), held])].sort();
      continue;
    }
    const branch = /^github\.ref\s*==\s*'refs\/heads\/([^']+)'$/.exec(part) ?? /^'refs\/heads\/([^']+)'\s*==\s*github\.ref$/.exec(part);
    const input = inputPart(part);
    const fork = forkPart(part);
    if (fork) {
      gate.fork = fork.fork;
      // head.repo.fork is null on any other event, so it holds the work to a
      // pull request; head.repo.full_name != github.repository holds there.
      if (fork.pullRequestOnly) gate.event = 'pull_request';
      continue;
    }
    if (event) gate.event = event[1];
    else if (branch) gate.branches = [...new Set([...(gate.branches ?? []), branch[1]])].sort();
    else if (/^startsWith\(\s*github\.ref\s*,\s*'refs\/tags\/[^']*'\s*\)$/.test(part) || /^github\.ref_type\s*==\s*'tag'$/.test(part)) {
      gate.event = 'push';
      gate.tags = true;
    } else if (input) gate.inputs = { ...(gate.inputs ?? {}), [input.name]: input.value };
    else if (strict) return UNREAD_PART;
  }
  if (gate.except) settleExcept(gate, triggers);
  return settleInputs(gate, triggers);
}

// Whether a part holds a pull request to one from a fork (fork true) or from
// this repository (fork false): github.event.pull_request.head.repo.fork,
// its negation or comparison with a boolean, and head.repo.full_name compared
// with github.repository. Null for any other part.
function forkPart(part) {
  const head = 'github\\.event\\.pull_request\\.head\\.repo';
  const bare = new RegExp(`^(!\\s*)?${head}\\.fork$`).exec(part);
  if (bare) return { fork: !bare[1], pullRequestOnly: !bare[1] };
  const compared = new RegExp(`^${head}\\.fork\\s*(==|!=)\\s*(true|false)$`).exec(part);
  if (compared) {
    const fork = (compared[1] === '==') === (compared[2] === 'true');
    return { fork, pullRequestOnly: fork };
  }
  const named = new RegExp(`^${head}\\.full_name\\s*(==|!=)\\s*github\\.repository$`).exec(part) ?? new RegExp(`^github\\.repository\\s*(==|!=)\\s*${head}\\.full_name$`).exec(part);
  if (named) return { fork: named[1] === '!=', pullRequestOnly: named[1] === '==' };
  return null;
}

// A gate that holds a pull request to where it comes from, with the other
// triggers it runs on every time (also), which the page names beside it.
function forkGate(gate, triggers) {
  if (gate.event && gate.event !== 'pull_request') return gate;
  if (gate.event === 'pull_request') return gate;
  const also = [...new Set(triggers.map((trigger) => trigger.event).filter((event) => event !== 'pull_request' && event !== 'pull_request_target' && event !== 'workflow_dispatch'))].sort();
  return { ...gate, ...(also.length > 0 ? { also } : {}) };
}

// inputs.x, github.event.inputs.x, their negation, and a comparison with a
// literal: the input and the value the work needs it to have.
function inputPart(part) {
  const name = '(?:github\\.event\\.)?inputs\\.([A-Za-z_][\\w-]*)';
  const bare = new RegExp(`^(!\\s*)?${name}$`).exec(part);
  if (bare) return { name: bare[2], value: !bare[1] };
  const compared = new RegExp(`^${name}\\s*==\\s*('[^']*'|true|false)$`).exec(part);
  if (!compared) return null;
  const literal = compared[2].replace(/^'|'$/g, '');
  return { name: compared[1], value: literal === 'true' ? true : literal === 'false' ? false : literal };
}

// Only a run by hand is given inputs, so one that must be set holds the work
// to that run. A workflow nothing runs by hand is given them some other way
// (workflow_call), which this map does not follow, so they gate nothing there.
function settleInputs(gate, triggers) {
  if (!gate.inputs) return gate;
  if (!triggers.some((trigger) => trigger.event === 'workflow_dispatch')) {
    delete gate.inputs;
    return gate;
  }
  if (Object.values(gate.inputs).some((value) => value !== false) && !gate.event) gate.event = 'workflow_dispatch';
  return gate;
}

/**
 * An || of alternatives, each an event, a ref or an input: the work runs on a
 * trigger any alternative holds on. A run by hand is dispatched from any
 * branch or tag, so an alternative that names a ref alone holds on it; one
 * that needs an input holds on it only with that input, which is the gate's
 * inputs. Every trigger held on without condition is no gate at all; one
 * alternative that is none of those shapes may hold on any trigger, so it
 * gates nothing either.
 */
function eitherGate(alternatives, triggers) {
  const gates = alternatives.map((alternative) => conjunctionGate(alternative, triggers, true));
  if (gates.some((gate) => gate === UNREAD_PART) || triggers.length === 0) return null;
  let inputs = null;
  let fork = null;
  const held = triggers.map((trigger) => {
    let status = 'never';
    for (const gate of gates) {
      const byHand = trigger.event === 'workflow_dispatch';
      const reached = byHand ? (!gate.event || gate.event === 'workflow_dispatch' || gate.byHand === true) && !(gate.except ?? []).includes('workflow_dispatch') && gate.fork == null : meets(trigger, gate);
      if (!reached) continue;
      // A pull request held to where it comes from is run only for some.
      if (gate.fork != null) {
        const pullRequest = trigger.event === 'pull_request' || trigger.event === 'pull_request_target';
        if (!pullRequest) {
          if (!gate.event) return 'always';
          continue;
        }
        if (status === 'never') {
          status = 'fork';
          fork = gate.fork;
        }
        continue;
      }
      const needs = Object.values(gate.inputs ?? {});
      if (!byHand && needs.some((value) => value !== false)) continue;
      if (!byHand || needs.length === 0) return 'always';
      if (status === 'never') {
        status = 'inputs';
        inputs = gate.inputs;
      }
    }
    return status;
  });
  if (held.every((status) => status === 'always')) return null;
  const covered = triggers.filter((_, index) => held[index] !== 'never');
  const gate = coveredGate(covered, triggers);
  if (inputs && held.includes('inputs')) gate.inputs = inputs;
  if (fork != null && held.includes('fork')) {
    gate.fork = fork;
    const also = [...new Set(triggers.filter((trigger, index) => held[index] === 'always' && trigger.event !== 'workflow_dispatch').map((trigger) => trigger.event))].sort();
    if (also.length > 0 && !gate.event) gate.also = also;
  }
  return Object.keys(gate).length > 0 ? gate : null;
}

// The gate that holds to a set of a workflow's triggers: none when it is all
// of them, the one event when they share one, that event or a run by hand
// (byHand) when a run by hand is the other, and otherwise the events left
// out. A condition written as the events it runs on reads as those events.
function coveredGate(covered, triggers) {
  if (covered.length === triggers.length) return {};
  const events = [...new Set(covered.map((trigger) => trigger.event))];
  const others = events.filter((event) => event !== 'workflow_dispatch');
  if (others.length === 1) {
    const gate = { event: others[0] };
    const held = covered.filter((trigger) => trigger.event === others[0]);
    if (others[0] === 'push' && held.every((trigger) => (trigger.tags?.length ?? 0) > 0 && !((trigger.branches?.length ?? 0) > 0))) gate.tags = true;
    // A push the workflow takes only to some branches is a push to those.
    else if (others[0] === 'push' && held.every((trigger) => (trigger.branches?.length ?? 0) > 0)) gate.branches = [...new Set(held.flatMap((trigger) => trigger.branches))].sort();
    if (events.includes('workflow_dispatch')) gate.byHand = true;
    return gate;
  }
  if (events.length === 1) return { event: events[0] };
  return { except: [...new Set(triggers.filter((trigger) => !events.includes(trigger.event)).map((trigger) => trigger.event))].sort() };
}

/**
 * What a workflow's release ships, read once every job is: a job that builds
 * a binary (cargo build, the Tauri CLI's build, pyinstaller) ships what it
 * builds when it uploads to a release itself, or uploads an artifact that a
 * job uploading to a release downloads. Each such build is then the
 * binary's entry run, marked built, not a check; and every release upload
 * sends what those jobs ship, named by what they upload: an MSI, NSIS, MSIX,
 * DMG, Debian, RPM or AppImage package by its path, and a binary for each
 * target the build names, else each target of the job's matrix, else each
 * system it runs on. An upload of what no build here makes ships the files
 * it names (sbom.json, dist/*), or files when it names only variables.
 * Uploads held to triggers that between them cover every trigger of the
 * workflow ship on every run, and are said once. Mutates runs and the scopes.
 */
function shipBuilds(shipping, runs, triggers, scopeOf) {
  const uploads = shipping.flatMap((entry) => entry.uploads);
  if (uploads.length === 0) return;
  const downloaded = shipping.some((entry) => entry.uploads.length > 0 && entry.downloads);
  const assets = new Set();
  for (const entry of shipping) {
    if (entry.builds.size === 0 && !entry.packs) continue;
    if (entry.uploads.length === 0 && !(downloaded && entry.artifacts.length > 0)) continue;
    const named = new Set();
    let bare = false;
    for (const path of [...entry.artifacts, ...entry.uploads.flatMap((upload) => upload.files)]) {
      const kind = packageKind(path);
      if (kind) named.add(kind);
      else bare = true;
    }
    if (entry.packs) named.add('msix');
    for (const kind of named) assets.add(kind);
    if ((bare || named.size === 0) && entry.builds.size > 0) {
      for (const target of jobTargets(entry)) assets.add(`binary:${target}`);
    }
    for (const run of runs.values()) {
      if (run.job === entry.job && entry.builds.has(run.path)) {
        run.runKind = 'executes';
        run.built = true;
      }
    }
  }
  for (const run of runs.values()) delete run.builds;
  // With no build here the upload is named by what it hands over: a path as
  // spelled, a file outside the checkout by its name, and files when a step
  // hands over a variable.
  const named = [...new Set(uploads.flatMap((upload) => upload.files).filter((path) => !path.includes('$'))
    .map((path) => (path.startsWith('/') ? posix.basename(path) : path.replace(/^\.\//, ''))))].sort(compare);
  // A path set at run time beside named ones is more than the names: said.
  const unnamed = uploads.some((upload) => upload.files.some((path) => path.includes('$')));
  const shipped = assets.size > 0 ? [...assets] : named.length > 0 ? [...named.map((path) => `file:${path}`), ...(unnamed ? ['files'] : [])] : ['files'];
  // Every trigger an upload runs on, and whether they cover the workflow's.
  const covers = triggers.length > 0 && triggers.every((trigger) => uploads.some((upload) => upload.when == null || (trigger.event === 'workflow_dispatch'
    ? upload.when.event === 'workflow_dispatch' || upload.when.byHand === true || (!upload.when.event && !upload.when.tags && !(upload.when.except ?? []).includes('workflow_dispatch'))
    : meets(trigger, upload.when))));
  const scopes = covers ? [scopeOf(null)] : [...new Map(uploads.map((upload) => [upload.when ? canonical(upload.when) : '', scopeOf(upload.when)])).values()];
  for (const scope of scopes) for (const asset of shipped) scope.sends.assets.add(asset);
}

// Whether a step held to `when` runs only on a release event: its gate is
// the release event, or every trigger of the workflow but a run by hand is.
function onReleaseEvent(when, triggers) {
  if (when?.event) return when.event === 'release';
  const events = triggers.map((trigger) => trigger.event).filter((event) => event !== 'workflow_dispatch');
  return events.length > 0 && events.every((event) => event === 'release');
}

// A path input, one path or one per line.
function inputPaths(value) {
  if (typeof value !== 'string') return [];
  return value.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
}

// The files a step's gh release upload hands over, past the tag; null for a
// step that uploads nothing to a release.
function releaseUploads(run) {
  let found = null;
  for (const tokens of commandLines(run)) {
    const words = programWords(tokens);
    if (words[0] !== 'gh' || words[1] !== 'release' || words[2] !== 'upload') continue;
    found ??= [];
    // A redirect the shell reads (2>/dev/null) is no file handed over.
    found.push(...words.slice(4).filter((word) => !word.startsWith('-') && !/[<>|&]/.test(word)));
  }
  return found;
}

// A package a release ships, by the path it is uploaded from: a Tauri
// bundle's directory (bundle/msi/, bundle/nsis/) or the file's extension.
function packageKind(path) {
  const text = String(path).toLowerCase();
  const bundle = /(?:^|\/)bundle\/(msi|nsis|dmg|deb|rpm|appimage|msix)\//.exec(text);
  if (bundle) return bundle[1];
  const ext = /\.(msi|msix|dmg|deb|rpm|appimage)$/.exec(text);
  return ext ? ext[1] : null;
}

// The targets a job builds binaries for, as cargo build's --target names
// them in its commands (a matrix value spelled out), else the job matrix's
// target values, else the systems the job runs on.
function jobTargets(entry) {
  if (entry.targets.size > 0) return [...entry.targets];
  const matrix = isMapping(entry.body.strategy) && isMapping(entry.body.strategy.matrix) ? entry.body.strategy.matrix : {};
  const values = matrixValues(matrix, 'target');
  if (values.length > 0) return values;
  return entry.platforms.map((platform) => PLATFORM_NAMES[platform] ?? platform);
}

const PLATFORM_NAMES = { linux: 'Linux', macos: 'macOS', windows: 'Windows' };

function matrixValues(matrix, key) {
  const values = [];
  for (const value of Array.isArray(matrix[key]) ? matrix[key] : []) if (typeof value === 'string' || typeof value === 'number') values.push(String(value));
  for (const entry of Array.isArray(matrix.include) ? matrix.include : []) {
    if (isMapping(entry) && (typeof entry[key] === 'string' || typeof entry[key] === 'number')) values.push(String(entry[key]));
  }
  return [...new Set(values)];
}

/**
 * The directories a working-directory spelled with a matrix value or a
 * dispatch input can be, as raw directories, or null when it spells
 * neither: src/${{ matrix.project }} is src/<each value of the project
 * axis>; examples/${{ inputs.tool }} is examples/<each option of a choice
 * input>, or every tracked directory examples/* matches.
 */
function expandedDirs(raw, body, on, repo) {
  if (typeof raw !== 'string' || !raw.includes('${{')) return null;
  const matrix = isMapping(body.strategy) && isMapping(body.strategy.matrix) ? body.strategy.matrix : {};
  const inputs = isMapping(on) && isMapping(on.workflow_dispatch) && isMapping(on.workflow_dispatch.inputs) ? on.workflow_dispatch.inputs : {};
  const expression = /\$\{\{\s*(?:matrix\.([\w-]+)|(?:github\.event\.)?inputs\.([\w-]+))\s*\}\}/g;
  const found = [...raw.matchAll(expression)];
  if (found.length !== 1 || raw.replace(expression, '').includes('${{')) return null;
  const [whole, axis, input] = found[0];
  let values = null;
  if (axis != null) values = matrixValues(matrix, axis);
  else if (isMapping(inputs[input]) && Array.isArray(inputs[input].options)) values = inputs[input].options.filter((value) => typeof value === 'string' || typeof value === 'number').map(String);
  if (values != null) return values.length > 0 ? values.map((value) => raw.replace(whole, value)) : null;
  if (input == null || !isMapping(inputs[input])) return null;
  const pattern = cleanDir(raw.replace(whole, '*'));
  if (pattern == null || pattern.includes('$')) return null;
  const isMatch = picomatch(pattern);
  const dirs = [...repo.dirs].filter((dir) => isMatch(dir)).sort(compare);
  return dirs.length > 0 ? dirs : null;
}

// The --target each cargo build of a step names: a literal, or the values of
// the matrix key an expression spells.
function buildTargets(run, body) {
  const out = [];
  const matrix = isMapping(body.strategy) && isMapping(body.strategy.matrix) ? body.strategy.matrix : {};
  for (const tokens of commandLines(run)) {
    const words = programWords(tokens);
    if (words[0] !== 'cargo' || !words.slice(1).find((word) => !word.startsWith('-') && !word.startsWith('+'))?.match(/^(build|b)$/)) continue;
    for (let i = 1; i < words.length; i += 1) {
      const value = words[i] === '--target' ? words[i + 1] : words[i].startsWith('--target=') ? words[i].slice('--target='.length) : null;
      if (value == null) continue;
      const axis = /^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$/.exec(value);
      if (axis) out.push(...matrixValues(matrix, axis[1]));
      else if (!value.includes('$')) out.push(value);
    }
  }
  return out;
}

// A step's gate inside a job's: the step's narrows the job's.
function joinGates(job, step) {
  if (!step) return job;
  if (!job) return step;
  const inputs = { ...(job.inputs ?? {}), ...(step.inputs ?? {}) };
  const joined = { ...job, ...step };
  if (Object.keys(inputs).length > 0) joined.inputs = inputs;
  // A step held to an event of its own runs by hand only when its own
  // condition lets it.
  if (step.event && !step.byHand) delete joined.byHand;
  if (joined.event === 'workflow_dispatch') delete joined.byHand;
  return canonical(joined) === canonical(job) ? job : joined;
}

// A path a job runs from steps held to different triggers, or from one held
// to none, runs on each of them; only a path every step of holds to one
// trigger is held to it.
function mergeRun(a, b) {
  const out = better(a, b);
  if (a.when && b.when && canonical(a.when) === canonical(b.when)) out.when = a.when;
  else delete out.when;
  return out;
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

// What an excepted event leaves is the gate, when it is one trigger's worth,
// with a run by hand when the workflow has one the gate does not except.
function settleExcept(gate, triggers) {
  if (gate.event) {
    delete gate.except;
    return;
  }
  const left = triggers.filter((trigger) => !gate.except.includes(trigger.event) && trigger.event !== 'workflow_dispatch');
  const events = [...new Set(left.map((trigger) => trigger.event))];
  if (events.length !== 1) return;
  const [only] = events;
  const byHand = !gate.except.includes('workflow_dispatch') && triggers.some((trigger) => trigger.event === 'workflow_dispatch');
  delete gate.except;
  gate.event = only;
  if (byHand) gate.byHand = true;
  if (only !== 'push') return;
  const tagged = left.every((trigger) => (trigger.tags?.length ?? 0) > 0 && !((trigger.branches?.length ?? 0) > 0));
  if (tagged) {
    gate.tags = true;
    return;
  }
  const branches = left.map((trigger) => trigger.branches ?? []);
  if (branches.every((list) => list.length > 0)) gate.branches = [...new Set([...(gate.branches ?? []), ...branches.flat()])].sort();
}

/**
 * A path two gated jobs run runs on the triggers either holds on: each of
 * its runs is held to that union (none, when it covers every trigger), so
 * the page says the path under one gate rather than under none. A gate on
 * inputs or on where a pull request comes from is left as it is.
 */
function unionPathGates(runs, triggers) {
  const byPath = new Map();
  for (const run of runs) {
    if (!byPath.has(run.path)) byPath.set(run.path, []);
    byPath.get(run.path).push(run);
  }
  for (const group of byPath.values()) {
    const keys = new Set(group.map((run) => (run.when ? canonical(run.when) : null)));
    if (keys.size < 2 || keys.has(null)) continue;
    if (group.some((run) => run.when.inputs || run.when.fork != null || run.when.also)) continue;
    const covered = triggers.filter((trigger) => group.some((run) => meets(trigger, run.when)));
    const gate = coveredGate(covered, triggers);
    for (const run of group) {
      if (Object.keys(gate).length === 0) delete run.when;
      else run.when = { ...gate };
    }
  }
}

function meets(trigger, gate) {
  if (gate.byHand && trigger.event === 'workflow_dispatch') return true;
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
  // A directory stands for a file under it that it does as much to: a run
  // for anything, a build for a build or a check, a check for a check.
  const doing = (entry) => (entry.runKind === 'checks' ? 0 : entry.built ? 1 : 2);
  const covered = (entry) => entry.matched && directories.some((dir) => (
    dir.job === entry.job && entry.path !== dir.path && entry.path.startsWith(dir.path)
    && doing(dir) >= doing(entry)
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

/**
 * What a step's command lines send out of the repository, read word by word
 * the way the shell splits them, so a command quoted inside an echo sends
 * nothing. A publish with --dry-run sends nothing either. An npm publish
 * names the package at the directory it runs in: the step's
 * working-directory, moved by cd, or the directory it is handed.
 */
function commandSends(run, sends, place) {
  let cwd = place.raw;
  let loopBase = cwd;
  // Code a step hands an interpreter (python - <<'PY', python -c) sends as
  // its calls do; a comment sends nothing.
  const said = run.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
  if (HUB_UPLOAD.test(said) && said.includes('huggingface_hub')) sends.publishesTo.add('huggingface');
  // A Zenodo deposit is a draft until actions/publish mints its DOI.
  if (ZENODO_DEPOSIT.test(said) && ZENODO_PUBLISH.test(said)) sends.publishesTo.add('zenodo');
  // The directory the last pack in this pass of a loop ran in: npm publish
  // "$tarball" after tarball=$(cd "$dir" && pnpm pack) sends that package.
  let packed = null;
  for (const tokens of unrolled(commandLines(run), 0, (word) => loopWords(word, place.repo))) {
    if (tokens[0] === LOOP_TURN) {
      if (tokens[1] === 0) loopBase = cwd;
      else cwd = loopBase;
      packed = null;
      continue;
    }
    if (tokens[0] === 'cd' && tokens.length <= 2) {
      cwd = tokens[1] == null ? '' : joinDir(cwd, tokens[1]);
      continue;
    }
    const words = programWords(tokens);
    if (words.length === 0) continue;
    const [program, sub] = words;
    if ((program === 'npm' || program === 'pnpm' || program === 'yarn') && sub === 'pack') packed = cwd;
    if (program === 'gh' && sub === 'release' && words[2] === 'create') sends.releases = true;
    if (program === 'gh' && sub === 'pr' && words[2] === 'create') sends.opensPullRequests = true;
    const exported = godotExport(words, place);
    if (exported != null) {
      sends.exports.add(exported);
      continue;
    }
    const registry = publishRegistry(words);
    if (registry == null || words.includes('--dry-run')) continue;
    // npm refuses to publish a private package, so such a publish sends
    // nothing (accessibility-suite's root).
    if (registry === 'npm' && packed == null && refusedByNpm(words, cwd, place)) continue;
    sends.publishesTo.add(registry);
    // The crate a cargo publish sends: the one -p names, or the one found
    // from where it runs (index.js markUnshipped).
    if (registry === 'crates.io') {
      const at = words.findIndex((word) => word === '-p' || word === '--package');
      sends.crates.push({ dir: cwd ?? '', ...(at !== -1 && words[at + 1] ? { name: words[at + 1] } : {}) });
    }
    if (registry !== 'npm') continue;
    const tarball = words.slice(words.indexOf('publish') + 1).find((word) => !word.startsWith('-'));
    const from = packed != null && tarball != null && (tarball.includes('$') || /\.tgz$/.test(tarball)) ? packed : null;
    for (const entry of from != null ? publishedPackages(['publish'], from, place) : publishedPackages(words, cwd, place)) sends.packages.set(entry.key, entry.value);
  }
}

/**
 * The words a shell for loop over a glob goes through, when the glob names
 * tracked directories (packages/*\/) or files: each one, in the order sh
 * sorts them. Null for any other word, which the loop leaves as it is.
 */
function loopWords(word, repo) {
  if (!/[*?[]/.test(word) || word.includes('$')) return null;
  const dirs = word.endsWith('/');
  const pattern = word.replace(/^\.\//, '').replace(/\/+$/, '');
  const isMatch = picomatch(pattern, { dot: false });
  const found = [...(dirs ? repo.dirs : repo.tracked)].filter((path) => isMatch(path)).sort(compare);
  return found.length > 0 ? found.map((path) => (dirs ? `${path}/` : path)) : null;
}

const HUB_UPLOAD = /\b(?:upload_folder|upload_file|upload_large_folder|create_commit|push_to_hub)\s*\(/;
const ZENODO_DEPOSIT = /zenodo\.org\/api\/deposit/;
const ZENODO_PUBLISH = /\/actions\/publish\b/;
// Marks the start of one pass through an unrolled loop, with the directory
// the loop began in: a (cd "$dir" && ...) subshell leaves it there.
const LOOP_TURN = '\0turn';

/**
 * A shell for over literal words, unrolled: the body once per word, with the
 * loop's variable spelled out, so for dir in packages/a packages/b; do (cd
 * "$dir" && npm publish); done publishes both packages by name. A loop over
 * a glob or a variable is left as it is.
 */
function unrolled(lines, depth = 0, expand = () => null) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const tokens = lines[i];
    // A glob over tracked directories or files is what sh hands the loop.
    const words = tokens.slice(3).flatMap((word) => expand(word) ?? [word]);
    if (tokens[0] !== 'for' || tokens[2] !== 'in' || depth > 2 || words.length === 0 || words.some((word) => /[$*?[{`]/.test(word))) {
      out.push(tokens);
      continue;
    }
    let level = 0;
    let end = i + 1;
    for (; end < lines.length; end += 1) {
      if (lines[end][0] === 'for') level += 1;
      if (lines[end][0] === 'done') {
        if (level === 0) break;
        level -= 1;
      }
    }
    const body = lines.slice(i + 1, end)
      .map((line) => (line[0] === 'do' ? line.slice(1) : line))
      .filter((line) => line.length > 0);
    const name = tokens[1];
    const spelled = (word, value) => word.replaceAll(`\${${name}}`, value).replace(new RegExp(`\\$${name}(?![A-Za-z0-9_])`, 'g'), value);
    for (const value of words) {
      out.push([LOOP_TURN, words.indexOf(value)]);
      out.push(...unrolled(body.map((line) => line.map((word) => spelled(word, value))), depth + 1, expand));
    }
    i = end;
  }
  return out;
}

const GODOT_BINARY = /^godot(?:[\d.]*|_v[\w.-]+)(?:\.exe)?$/i;

/**
 * What a Godot export builds a release of: the platform of the preset
 * --export-release, --export-debug or --export-pack names, from the
 * export_presets.cfg of the project, or the preset's name when the file is
 * not tracked. null for any other command line.
 */
function godotExport(words, place) {
  if (!GODOT_BINARY.test(words[0] ?? '')) return null;
  const at = words.findIndex((word) => /^--export-(?:release|debug|pack)$/.test(word));
  if (at === -1 || words[at + 1] == null) return null;
  const preset = words[at + 1];
  const found = godotProjects(place.repo.repoPath, place.repo.tracked).flatMap((project) => project.presets).find((entry) => entry.name === preset);
  return found?.platform ?? preset;
}

// The registry a command line publishes to, from its program and subcommand.
// A registry is named the way its users name it.
function publishRegistry(words) {
  const [program, sub, next] = words;
  // pnpm --filter <name> publish: its own flags come before the command.
  if (program === 'pnpm' && sub?.startsWith('-')) {
    let i = 1;
    while (i < words.length && words[i].startsWith('-')) i += ['--filter', '-F', '-C', '--dir', '--filter-prod'].includes(words[i]) ? 2 : 1;
    if (words[i] === 'publish') return 'npm';
  }
  if ((program === 'huggingface-cli' || program === 'hf') && sub === 'upload') return 'huggingface';
  if ((program === 'npm' || program === 'pnpm' || program === 'bun') && sub === 'publish') return 'npm';
  if (program === 'yarn' && (sub === 'publish' || (sub === 'npm' && next === 'publish'))) return 'npm';
  if (program === 'twine' && sub === 'upload') return 'pypi';
  if (['uv', 'poetry', 'hatch', 'flit'].includes(program) && sub === 'publish') return 'pypi';
  if (program === 'cargo' && sub === 'publish') return 'crates.io';
  if (program === 'gem' && sub === 'push') return 'rubygems';
  if (program === 'vsce' && sub === 'publish') return 'vscode-marketplace';
  if (program === 'ovsx' && sub === 'publish') return 'open-vsx';
  if ((program === 'docker' || program === 'podman') && sub === 'push') return 'container image';
  if (program === 'docker' && (sub === 'build' || (sub === 'buildx' && next === 'build')) && words.includes('--push')) return 'container image';
  return null;
}

// A command line's words from the program it runs: assignments, runners such
// as sudo and env, and a package runner (npx, pnpm dlx, python -m) put aside,
// and a program typed by its path or its scoped package name named by itself.
function programWords(tokens) {
  let at = 0;
  const skipAssignments = () => {
    while (at < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[at])) at += 1;
  };
  skipAssignments();
  while (at < tokens.length && (RUNNER_WORDS.has(tokens[at]) || SHELL_KEYWORDS.has(tokens[at]))) {
    at += 1;
    skipAssignments();
  }
  const name = (word) => (word ?? '').replace(/^.*\//, '').replace(/@[^/]*$/, '');
  let program = name(tokens[at]);
  if (program === 'npx' || program === 'bunx' || ((program === 'pnpm' || program === 'yarn') && ['dlx', 'exec'].includes(tokens[at + 1])) || (program === 'npm' && tokens[at + 1] === 'exec')) {
    at += program === 'npx' || program === 'bunx' ? 1 : 2;
    while (at < tokens.length && tokens[at].startsWith('-')) at += NPX_VALUE_FLAGS.has(tokens[at]) ? 2 : 1;
    program = name(tokens[at]);
  } else if (/^python[\d.]*$/.test(program) && tokens[at + 1] === '-m') {
    at += 2;
    program = name(tokens[at]);
  }
  if (at >= tokens.length) return [];
  return [program, ...tokens.slice(at + 1)];
}

function joinDir(dir, next) {
  if (next.includes('$') || dir.includes('$')) return next.startsWith('/') || next.startsWith('$') ? next : `${dir}/${next}`;
  return posix.normalize(dir ? `${dir}/${next}` : next).replace(/\/+$/, '').replace(/^\.$/, '');
}

/**
 * The packages an npm publish sends: each workspace member -w names, or the
 * one at the directory it is handed or runs in, by its manifest's name. A
 * directory set at run time names no one package; when an earlier step of
 * the job assigns it under a fixed directory (PKG_DIR="packages/$SLUG"), it
 * is one of the packages there, chosen by the tag when a tag starts the
 * workflow.
 */
// An npm publish of one directory, spelled out, whose manifest is private.
function refusedByNpm(words, cwd, place) {
  const args = words.slice(words.indexOf('publish') + 1);
  if (words[0] !== 'npm' || args.some((word) => /^(?:-w|--workspaces?|-ws)(?:=|$)/.test(word))) return false;
  const handed = args.find((word, index) => !word.startsWith('-') && !(index > 0 && ['--tag', '--access', '--otp', '--registry'].includes(args[index - 1])));
  if (handed != null && /\.tgz$/.test(handed)) return false;
  const dir = handed != null ? joinDir(cwd, handed) : cwd;
  if (dir == null || dir.includes('$')) return false;
  const clean = dir.replace(/^\.\/?/, '').replace(/\/+$/, '');
  const manifest = place.repo.manifest(clean);
  return manifest?.private === true;
}

function publishedPackages(words, cwd, place) {
  const at = words.indexOf('publish');
  const args = words.slice(at + 1);
  const chosen = place.tagged ? 'tag' : 'run';
  if (args.includes('--workspaces') || args.includes('-ws')) return [{ key: 'workspaces', value: { registry: 'npm', workspace: 'every' } }];
  const members = [];
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i].split('=')[0];
    if (flag !== '-w' && flag !== '--workspace') continue;
    const value = args[i].includes('=') ? args[i].slice(args[i].indexOf('=') + 1) : args[i + 1];
    if (value == null) continue;
    // A member named at run time, as a loop over the workspace does: which
    // ones, the loop decides.
    if (value.includes('$')) {
      members.push({ key: 'workspace', value: { registry: 'npm', workspace: true } });
      continue;
    }
    for (const [dir, name] of place.repo.workspaces()) {
      if (typeof name === 'string' && (name === value || dir === joinDir(cwd, value))) members.push({ key: `named\0${dir}`, value: { dir, name, registry: 'npm' } });
    }
  }
  // pnpm publish --filter <name> (or pnpm --filter <name> publish) sends
  // the members the selector names: a name, a glob over names, or a path.
  if (words[0] === 'pnpm') {
    for (let i = 1; i < words.length; i += 1) {
      const flag = words[i].split('=')[0];
      if (flag !== '--filter' && flag !== '-F') continue;
      const value = words[i].includes('=') ? words[i].slice(words[i].indexOf('=') + 1) : words[i + 1];
      if (value == null || value.startsWith('!')) continue;
      if (value.includes('$')) {
        members.push({ key: 'workspace', value: { registry: 'npm', workspace: true } });
        continue;
      }
      const bare = value.replace(/^\.\.\./, '').replace(/\.\.\.$/, '').replace(/^\{(.+)\}$/, '$1');
      const isMatch = picomatch(bare);
      for (const [dir, name] of place.repo.workspaces()) {
        if (typeof name !== 'string') continue;
        if (isMatch(name) || dir === joinDir(cwd, bare).replace(/^\.\/?/, '').replace(/\/+$/, '')) {
          if (place.repo.manifest(dir)?.private === true) continue;
          members.push({ key: `named\0${dir}`, value: { dir, name, registry: 'npm' } });
        }
      }
    }
  }
  if (members.length > 0) return members;
  const handed = args.find((word, index) => !word.startsWith('-') && !/\.tgz$/.test(word)
    && !(index > 0 && ['--tag', '--access', '--otp', '--registry', '-w', '--workspace'].includes(args[index - 1])));
  const dir = handed != null ? joinDir(cwd, handed) : cwd;
  if (!dir.includes('$')) {
    const clean = dir.replace(/^\.\/?/, '').replace(/\/+$/, '');
    const manifest = place.repo.manifest(clean);
    const name = manifest?.name;
    // npm refuses a private package, which a loop skips.
    if (typeof name !== 'string' || name === '' || manifest?.private === true) return [];
    return [{ key: `named\0${clean}`, value: { dir: clean, name, registry: 'npm' } }];
  }
  const variable = /\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/.exec(dir);
  const assigned = variable ? assignment(place.jobTexts, variable[1] ?? variable[2]) : null;
  const prefix = assigned && assigned.includes('$') ? assigned.slice(0, assigned.indexOf('$')) : null;
  const under = prefix && prefix.endsWith('/') ? prefix.replace(/^\.\//, '').replace(/\/+$/, '') : null;
  if (under == null || !place.repo.dirs.has(under)) return [{ key: 'run-time', value: { chosenBy: chosen, registry: 'npm' } }];
  const count = place.repo.filesUnder(under).filter((path) => /^[^/]+\/package\.json$/.test(path.slice(under.length + 1))).length;
  return [{ key: `under\0${under}`, value: { chosenBy: chosen, count, registry: 'npm', under: `${under}/` } }];
}

// The value a job's earlier steps give a shell variable, quotes dropped: the
// last assignment wins, as it would when the steps run in order.
function assignment(texts, variable) {
  let value = null;
  for (const text of texts) {
    for (const tokens of commandLines(text)) {
      let at = ['export', 'local', 'declare', 'readonly'].includes(tokens[0]) ? 1 : 0;
      for (; at < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[at]); at += 1) {
        if (tokens[at].startsWith(`${variable}=`)) value = tokens[at].slice(variable.length + 1);
      }
    }
  }
  return value;
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

// The directory a job checks this repository out into, when it names one:
// actions/checkout with a path and no repository, or this repository by the
// expression that names it.
function ownCheckoutPath(steps) {
  for (const step of steps) {
    if (!isMapping(step) || typeof step.uses !== 'string' || step.uses.replace(/@.*$/, '') !== 'actions/checkout') continue;
    const input = isMapping(step.with) ? step.with : {};
    const repository = typeof input.repository === 'string' ? input.repository.replace(/\s+/g, '') : null;
    if (repository != null && repository !== '${{github.repository}}') continue;
    const dir = typeof input.path === 'string' ? cleanDir(input.path) : null;
    return dir == null || dir === '' ? null : dir;
  }
  return null;
}

// The flags a command takes the place it writes after.
const OUTPUT_FLAGS = new Set(['--out', '--output', '--out-dir', '--outdir', '--output-dir', '-o']);

/**
 * The places of this repository a step run outside its checkout names by a
 * path through the checkout's directory: each word (and each --flag=value
 * value) that, read from where the step runs, lands under the checkout, and
 * is a tracked file or directory there. One handed to an output flag is a
 * place the command, another repository's code, writes; a check mode
 * (--check, --dry-run) writes nothing.
 */
function throughCheckout(run, dir, selfPath, repo) {
  const named = new Set();
  const written = new Set();
  for (const tokens of commandLines(run)) {
    const checking = tokens.includes('--check') || tokens.includes('--dry-run');
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const eq = token.startsWith('-') ? token.indexOf('=') : -1;
      const flag = eq === -1 ? (OUTPUT_FLAGS.has(tokens[i - 1]) ? tokens[i - 1] : null) : token.slice(0, eq);
      const value = eq === -1 ? token : token.slice(eq + 1);
      if (value === '' || value.startsWith('-') || value.includes('$') || value.startsWith('/')) continue;
      const joined = posix.normalize(dir ? `${dir}/${value}` : value).replace(/\/+$/, '');
      if (joined !== selfPath && !joined.startsWith(`${selfPath}/`)) continue;
      const path = joined === selfPath ? '' : joined.slice(selfPath.length + 1);
      if (path === '' || !(repo.tracked.has(path) || repo.dirs.has(path))) continue;
      if (flag != null && OUTPUT_FLAGS.has(flag) && !checking) written.add(path);
      else named.add(path);
    }
  }
  return { named: [...named].sort(), written: [...written].sort() };
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
