import { isSourcePath } from '../core/history.js';
import { isTestFile, isTestMaterial, ownTestPair } from '../core/landings.js';
import { isCodePath, languageOf } from '../core/languages.js';
import { isImagePath } from './templates.js';

/**
 * The page: how a repository works, written from the recorded facts.
 *
 * Every sentence below is built from a field of the structure, the statistics
 * or the boundary file, so a person never has to author the description. The
 * only prose a person may add is the summary, and the page says so when it
 * shows one. Nothing here reads the clock or the tree: the same artifacts give
 * the same bytes.
 */

const RUNS_SHOWN = 3;
const COLLAPSE_OVER = 3;
const BREAK_LINES = 8;
const PLACE_BREAKS = 2;
// Up to seven steps read as one sentence; more are a numbered list, since a
// reader holds about seven items at once. The list stops at twelve.
const SENTENCE_STEPS = 7;
const LISTED_STEPS = 12;
// Three or more calls in a row into one file are one step: the file's work.
const RUN_COLLAPSE = 3;
const SUB_INDENT = '   ';
// One file's entry is followed into at most five of the functions it calls,
// the ones with the most work to put in order.
const INNER_SHOWN = 5;
// An entry's early returns are said this many at a time, the rest counted.
const ALTERNATIVES_SHOWN = 3;
const INNER_STEPS = 3;
// A step names the runs of at most this many parts, the rest counted.
const GROUPS_SHOWN = 6;
const PAIRS_SHOWN = 5;
const UNTESTED_SHOWN = 8;
const UNREAD_SHOWN = 8;
const DUPLICATES_SHOWN = 5;
// A name exported alike by this many parts reads as a contract, and the line
// names this many of them.
const CONTRACT_PARTS = 3;
const CONTRACT_NAMED = 5;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ROOT_NAME = 'the repository root';
const SITE_NAME = 'the site';

function cmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function list(items, { serial = false } = {}) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  const joiner = serial && items.length > 2 ? ', and ' : ' and ';
  return `${items.slice(0, -1).join(', ')}${joiner}${last}`;
}

// A clause that already holds "and" needs a comma before the next one, or the
// reader cannot tell where one list ends and the next clause begins.
function clauseList(clauses) {
  if (clauses.length === 1) return clauses[0];
  const tangled = clauses.slice(0, -1).some((clause) => clause.includes(' and '));
  if (clauses.length === 2) return tangled ? `${clauses[0]}, and ${clauses[1]}` : `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

export function count(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function capitalize(text) {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

function under(path, place) {
  return path === place || path.startsWith(`${place}/`);
}

function id(name) {
  return name;
}

// A glob with no slash and no ** matches only files at the top of the tree.
function rootLevel(glob) {
  const pattern = String(glob).replaceAll('\\', '/');
  return !pattern.includes('/') && !pattern.includes('**');
}

/**
 * The name the page's prose gives a boundary. One drawn only from files at
 * the top of the tree has no directory to be called by, and the word a person
 * chose for it ("root" is typical) reads as an ordinary word in a sentence, so
 * the page calls it the repository root. page.json keeps the id as the
 * boundary file writes it.
 *
 * @param {{ name: string, globs?: string[] }} boundary
 * @returns {string}
 */
export function displayName(boundary) {
  const globs = boundary.globs ?? [];
  if (globs.length > 0 && globs.every(rootLevel)) return ROOT_NAME;
  return boundary.role === 'site' ? SITE_NAME : boundary.name;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

// A place is shown with a trailing slash when it is a directory, so a reader
// can tell records/ from a file named records.
function facts({ structure, statistics }) {
  const boundaries = [...(structure.boundaries ?? [])].sort((a, b) => cmp(a.name, b.name));
  const boundaryOf = new Map();
  const tracked = [];
  for (const boundary of boundaries) {
    for (const file of boundary.files ?? []) {
      boundaryOf.set(file.path, boundary.name);
      tracked.push(file.path);
    }
  }
  for (const file of [...(structure.unassigned ?? []), ...(structure.overlaps ?? [])]) tracked.push(file.path);
  const isDir = (target) => tracked.some((path) => path.startsWith(`${target}/`));
  const fileOf = new Map();
  for (const file of [...boundaries.flatMap((boundary) => boundary.files ?? []), ...(structure.unassigned ?? []), ...(structure.overlaps ?? [])]) {
    fileOf.set(file.path, file);
  }
  // Every name the page gives a part, by id. page.json carries this map once,
  // so explain and the site name a part as the page does without each
  // reproducing displayName; a field that names a part keeps its id.
  const partLabels = Object.fromEntries(boundaries.map((boundary) => [boundary.name, displayName(boundary)]));
  const spans = new Map();
  const partsUnder = (dir) => {
    if (!spans.has(dir)) {
      const parts = new Set();
      for (const [path, part] of boundaryOf) if (path.startsWith(`${dir}/`)) parts.add(part);
      spans.set(dir, parts.size);
    }
    return spans.get(dir);
  };
  return {
    structure,
    statistics,
    boundaries,
    boundaryOf,
    fileOf,
    partLabels,
    shown: (name) => (Object.hasOwn(partLabels, name) ? partLabels[name] : name),
    partsUnder,
    place: (target) => (isDir(target) ? `${target}/` : target),
    doors: orderDoors(markSharedNames(structure.doors ?? [])),
    // A weak landing is a bare file name under a root the engine could not
    // read; it stays in the artifact, and the page states nothing from it. A
    // landing that spans parts (packages/ above every package) is where the
    // parts live, not a place one of them writes, and is left out the same way,
    // and so is a place the repository does not track: output nobody keeps.
    landings: (structure.landings ?? []).filter((landing) => !landing.spans && landing.tracked !== false).map((landing) => ({
      target: landing.target,
      writers: (landing.writers ?? []).filter(strong),
      readers: (landing.readers ?? []).filter(strong),
    })),
    untrackedWrites: (structure.landings ?? []).filter((landing) => landing.tracked === false)
      .reduce((sum, landing) => sum + (landing.writers ?? []).filter(strong).length, 0),
  };
}

function strong(entry) {
  return entry.confidence !== 'weak';
}

function reachSize(door) {
  return door.parseError ? 0 : (door.reach ?? []).length;
}

// A door that only a clock starts (by hand aside) is not the one a change
// goes through; between two that reach as far, it comes second.
function scheduleOnly(door) {
  const events = (door.triggers ?? []).map((trigger) => trigger.event);
  return events.includes('schedule') && events.every((event) => event === 'schedule' || event === 'workflow_dispatch');
}

// A door whose every run only checks code, a linter's or a type-checker's.
function checksOnly(door) {
  return (door.runs ?? []).length > 0 && (door.runs ?? []).every((run) => run.runKind === 'checks');
}

// Between two doors that reach as far, the one a pull request goes through
// comes first, whatever it runs: it is the path a change takes into the
// repository. Then one that runs code comes before one that only checks it,
// one a change starts before one only the clock does, and a workflow before
// a command or package people install.
function byReach(doors) {
  return [...doors].sort((a, b) => (
    reachSize(b) - reachSize(a)
    || Number(!pullRequested(a)) - Number(!pullRequested(b))
    || Number(checksOnly(a)) - Number(checksOnly(b))
    || Number(scheduleOnly(a)) - Number(scheduleOnly(b))
    || Number(installed(a)) - Number(installed(b))
    || cmp(a.name, b.name)
    || cmp(a.file, b.file)
  ));
}

/**
 * A door that a manifest installs (a command people run, or the package they
 * import) rather than a workflow the repository starts.
 *
 * @param {{ kind?: string }} door
 */
export function installed(door) {
  return door.kind === 'command' || door.kind === 'package';
}

/**
 * The key a door is told apart by. A workflow is its file; one manifest can
 * install several commands, so an installed door is its manifest and name.
 *
 * @param {{ file: string, name: string, kind?: string }} door
 */
export function doorKey(door) {
  return installed(door) ? `${door.file}#${door.name}` : door.file;
}

// Workflows first, widest first; the commands a manifest installs after them,
// since nothing in the repository starts those. The busiest door keeps its
// place among the workflows whatever its kind, since the page follows it.
export function orderDoors(doors) {
  const ranked = byReach(doors);
  const main = mainDoor(doors);
  return [...ranked.filter((door) => !installed(door) || door === main), ...ranked.filter((door) => installed(door) && door !== main)];
}

// What the page calls an installed door, and the verb for what it starts.
function installedAs(door) {
  const what = door.kind !== 'package' ? 'a command people run'
    : door.extension ? (door.unpublished ? "the extension's entry, not published from here" : `the extension people install from ${registryList(door.publishedTo ?? [])}`)
      : door.unpublished ? "the package's entry, not published from here" : 'the package people import';
  return door.sharedName ? `${what}, from ${door.file}` : what;
}

// backpropagate installs a command of one name from package.json and from
// pyproject.toml; each is named with its manifest so the two read apart.
function markSharedNames(doors) {
  const counts = new Map();
  for (const door of doors) if (installed(door)) counts.set(door.name, (counts.get(door.name) ?? 0) + 1);
  return doors.map((door) => (installed(door) && counts.get(door.name) > 1 ? { ...door, sharedName: true } : door));
}

function startVerb(door) {
  return door.kind === 'package' ? 'loads' : 'runs';
}

// A job that commits only on one trigger still commits into the repository;
// one that pushes its commit to another branch does not: a branch for review
// reaches main when a person merges it, and a branch of its own never does.
function commits(door) {
  const intoMain = (entry) => (entry.stages ?? []).length > 0 && !entry.pushesForReview && !(entry.pushesTo?.length > 0);
  return intoMain(door) || (door.gated ?? []).some(intoMain);
}

function reaching(doors) {
  return byReach(doors).filter((door) => !door.parseError && reachSize(door) > 0);
}

/**
 * The busiest door, the one the page follows. A test suite reaches every part,
 * so the widest door is usually the check, not the path work takes into the
 * repository: of the doors that reach a part, one that commits into the
 * repository comes first, the widest of those; with none, the widest door. A
 * door that reaches none is never the busiest, since there would be nothing
 * to follow through it.
 */
export function mainDoor(doors) {
  const found = reaching(doors);
  return found.find(commits) ?? found[0] ?? null;
}

// The widest door, when the page follows another; the page says why.
function widerDoor(doors, main) {
  const widest = reaching(doors)[0] ?? null;
  return widest && main && widest !== main && reachSize(widest) > reachSize(main) ? widest : null;
}

function boundaryRoot(boundary) {
  const globs = boundary.globs ?? [];
  if (globs.length !== 1) return null;
  const match = /^(.+)\/\*\*$/.exec(globs[0]);
  return match && !/[*?[{]/.test(match[1]) ? match[1] : null;
}

function boundaryPlace(boundary) {
  const root = boundaryRoot(boundary);
  return root ? `${root}/` : boundary.name;
}

function shownPlace(ctx, boundary) {
  return boundaryRoot(boundary) ? boundaryPlace(boundary) : ctx.shown(boundary.name);
}

// The smallest set of places that covers every target: a target under another
// listed target is part of it.
function cover(targets) {
  const unique = [...new Set(targets)].sort(cmp);
  return unique.filter((target) => !unique.some((other) => other !== target && under(target, other)));
}

// The paths the door runs on every trigger, or given `only`, those of one set.
// A path every job and step of which is held to one trigger is said with that
// trigger (gatedRuns), never in the sentence of another.
function runPaths(door, only = null) {
  const held = heldRuns(door);
  return [...new Set((door.runs ?? []).map((run) => run.path))]
    .filter((path) => (only ? only.has(path) : !held.has(path)))
    .sort(cmp);
}

const HELD = new WeakMap();

// Each path held to one trigger, by the gate's key. A path run from work held
// to two triggers, or to none, runs on each and is held to neither.
function heldRuns(door) {
  if (HELD.has(door)) return HELD.get(door);
  const byPath = new Map();
  for (const run of door.runs ?? []) {
    const key = run.when ? JSON.stringify(sortKeys(run.when)) : null;
    byPath.set(run.path, byPath.has(run.path) && byPath.get(run.path) !== key ? null : key);
  }
  const held = new Map([...byPath].filter(([, key]) => key != null));
  HELD.set(door, held);
  return held;
}

/**
 * The runs a door holds to one trigger, a group per trigger: the gate, the
 * paths and what the page says of them.
 *
 * @returns {Array<{ when: object, paths: Set<string> }>}
 */
function gatedRuns(door) {
  const groups = new Map();
  for (const [path, key] of heldRuns(door)) {
    if (!groups.has(key)) groups.set(key, { when: JSON.parse(key), paths: new Set() });
    groups.get(key).paths.add(path);
  }
  return [...groups.entries()].sort(([a], [b]) => cmp(a, b)).map(([, group]) => group);
}

// "runs X; checks Y" for the paths of one gated group, or null.
function heldClause(ctx, door, group, verb, joiner = '; ') {
  const clauses = [];
  const ran = shownRuns(door, 'executes', group.paths);
  const checked = shownRuns(door, 'checks', group.paths);
  if (ran.length > 0) clauses.push(`${verb} ${filesShown(ctx, ran)}`);
  if (checked.length > 0) clauses.push(`checks ${filesShown(ctx, checked)}`);
  return clauses.length > 0 ? clauses.join(joiner) : null;
}

// The sentence that says what a door does on one trigger only: "On a pull
// request, it also runs scripts/comment.mjs."
function heldSentences(ctx, door, verb, alsoRuns) {
  return gatedRuns(door).map((group) => {
    const clause = heldClause(ctx, door, group, verb);
    return clause ? `${capitalize(gateLead(group.when))}, it ${alsoRuns ? 'also ' : ''}${clause}.` : null;
  }).filter(Boolean);
}

// Whether the door runs each path or only checks it. A path any of its tools
// runs is run; an artifact written before runs carried a kind ran all it listed.
function runKinds(door) {
  const kinds = new Map();
  for (const run of door.runs ?? []) {
    if (kinds.get(run.path) !== 'executes') kinds.set(run.path, run.runKind === 'checks' ? 'checks' : 'executes');
  }
  return kinds;
}

// The runs the page names: a path under a directory the door also runs is
// part of that run, so the directory is named and the path is not, unless the
// commands name the path and only a tool's patterns reached the directory: a
// script the workflow runs by name stays named under the directory a linter
// covers. A directory that is only checked never stands for a path that is
// run. What the commands name comes before what a tool's patterns matched, so
// a door that runs a script and a test suite leads with the script. A
// package names its entry first, then the code it loads before the data it
// exports. Given a kind, only the paths of that kind are named.
function shownRuns(door, kind = null, only = null) {
  const paths = runPaths(door, only);
  const kinds = runKinds(door);
  const dirs = paths.filter((path) => path.endsWith('/'));
  const named = new Set((door.runs ?? []).filter((run) => !run.matched).map((run) => run.path));
  const within = (path, dir) => dir !== path && path.startsWith(dir) && (!named.has(path) || named.has(dir))
    && (kinds.get(dir) === 'executes' || kinds.get(path) === 'checks');
  return paths
    .filter((path) => !dirs.some((dir) => within(path, dir)))
    .filter((path) => kind == null || kinds.get(path) === kind)
    .sort((a, b) => Number(!named.has(a)) - Number(!named.has(b))
      || Number(a !== door.entry) - Number(b !== door.entry)
      || (installed(door) ? Number(!isCodePath(a)) - Number(!isCodePath(b)) : 0) || cmp(a, b));
}

function cronWhen(cron) {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* (\d)$/.exec(String(cron).trim());
  if (!match) return '';
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  const day = Number(match[3]);
  if (minute > 59 || hour > 23 || day > 7) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `, ${WEEKDAYS[day]} at ${pad(hour)}:${pad(minute)} UTC`;
}

// A push filtered by tags and by branches starts on either, so both are named.
function pushPhrases(trigger) {
  const tagged = trigger.tags?.length > 0
    ? `when a tag matching ${list(trigger.tags.map((tag) => `\`${tag}\``)).replace(/ and /g, ' or ')} is pushed`
    : null;
  if (tagged && !(trigger.branches?.length > 0)) return [tagged];
  let phrase = 'on a push';
  if (trigger.branches?.length > 0) phrase += ` to ${list(trigger.branches)}`;
  if (trigger.paths?.length > 0) phrase += ` touching ${count(trigger.paths.length, 'path')}`;
  return tagged ? [phrase, tagged] : [phrase];
}

export function triggerPhrases(door) {
  const phrases = [];
  let byHand = false;
  for (const trigger of door.triggers ?? []) {
    switch (trigger.event) {
      case 'repository_dispatch':
        if (trigger.types?.length > 0) {
          for (const type of trigger.types) phrases.push(`when a repository sends a \`${type}\` event`);
        } else phrases.push('when a repository sends a dispatch');
        break;
      case 'schedule':
        phrases.push(trigger.cron ? `on a schedule (\`${trigger.cron}\`)${cronWhen(trigger.cron)}` : 'on a schedule');
        break;
      case 'push':
        phrases.push(...pushPhrases(trigger));
        break;
      case 'pull_request':
      case 'pull_request_target':
        phrases.push(trigger.paths?.length > 0 ? `on a pull request touching ${count(trigger.paths.length, 'path')}` : 'on a pull request');
        break;
      case 'release':
        phrases.push(trigger.types?.length > 0 && trigger.types.every((type) => type === 'published')
          ? 'when a release is published'
          : 'on a release event');
        break;
      case 'workflow_run':
        phrases.push(trigger.workflows?.length > 0
          ? `when the workflow ${list(trigger.workflows).replace(/ and /g, ' or ')} completes`
          : 'when another workflow completes');
        break;
      case 'workflow_dispatch':
        byHand = true;
        break;
      default:
        phrases.push(`on a \`${trigger.event}\` event`);
    }
  }
  if (byHand) phrases.push(phrases.length > 0 ? 'or by hand' : 'by hand');
  return phrases;
}

// What the page calls one pass through the main door, for "follow one ... end to end".
function triggerNoun(door) {
  if (installed(door)) return door.kind !== 'package' ? `run of ${door.name}` : door.extension ? `activation of ${door.name}` : `import of ${door.name}`;
  const first = (door.triggers ?? []).find((trigger) => trigger.event !== 'workflow_dispatch') ?? door.triggers?.[0];
  if (!first) return 'run';
  if (first.event === 'repository_dispatch' && first.types?.length > 0) return first.types[0].replace(/[_-]+/g, ' ');
  if (first.event === 'repository_dispatch') return 'dispatch';
  if (first.event === 'schedule') return 'scheduled run';
  if (first.event === 'push') return first.tags?.length > 0 && !(first.branches?.length > 0) ? 'tag push' : 'push';
  if (first.event === 'pull_request' || first.event === 'pull_request_target') return 'pull request';
  if (first.event === 'release') return 'release';
  if (first.event === 'workflow_dispatch') return 'run by hand';
  return 'run';
}

const RUN_TIME_PATH = 'a path set at run time';

// A staged path whose variable is set only when the workflow runs has no
// name to give; the page says that rather than printing the variable.
export function stagedShown(stages) {
  const named = (stages ?? []).filter((stage) => !stage.includes('$'));
  const later = named.length < (stages ?? []).length ? [RUN_TIME_PATH] : [];
  return [...new Set(named), ...later];
}

// Two staged places already hold an "and", so the push is joined with "then".
export function commitsClause(door) {
  const stages = stagedShown(door.stages);
  const push = pushWords(door);
  if (!push) return list(stages);
  return stages.length > 1 ? `${list(stages)}, then ${push}` : `${list(stages)} and ${push}`;
}

/**
 * Where a door's push goes, in the page's words: "pushes" to main, "pushes
 * to a branch for review, never to main", or "pushes to the atlas-render
 * branch, not to main"; null when it pushes nothing.
 *
 * @param {{ pushes?: boolean, pushesForReview?: boolean, pushesTo?: string[] }} door
 * @returns {string|null}
 */
export function pushWords(door) {
  if (door.pushes) return 'pushes';
  if (door.pushesForReview) return 'pushes to a branch for review, never to main';
  if (!(door.pushesTo?.length > 0)) return null;
  const named = door.pushesTo.filter((branch) => !branch.includes('$'));
  const branches = [...named.map((branch) => `the ${branch} branch`), ...(named.length < door.pushesTo.length ? ['a branch set at run time'] : [])];
  return `pushes to ${list(branches).replace(/ and /g, ' or ')}, not to main`;
}

const REGISTRIES = {
  'crates.io': 'crates.io',
  npm: 'npm',
  'open-vsx': 'Open VSX',
  pypi: 'PyPI',
  rubygems: 'RubyGems',
  'vscode-marketplace': 'the VS Code Marketplace',
};
const IMAGE = 'container image';

export function registryList(names) {
  return list(names.map((name) => REGISTRIES[name] ?? name));
}

// A package a publish sends whose directory is set at run time: one of the
// packages under the directory it is assigned under, the workspace's
// packages, or a package this map cannot name.
function chosenPackage(entry) {
  if (entry.under != null) return `one of the ${count(entry.count, 'package')} under ${entry.under}`;
  if (entry.workspace === 'every') return 'every workspace package';
  if (entry.workspace) return 'workspace packages';
  return 'a package';
}

function chosenBy(entry) {
  if (entry.chosenBy == null) return '';
  return entry.chosenBy === 'tag' ? ', chosen by the tag' : ', chosen at run time';
}

// Registries a door publishes to, then the image it pushes: "publishes to
// PyPI and a container image", naming the packages a publish names that are
// not the repository's own: "publishes attestia (packages/attestia) to npm",
// and one chosen at run time as what it could be. An item that already holds
// an "and" or a comma is joined to the next with a comma. An artifact written
// before publishesTo existed meant npm by publishes.
function publishPhrase(sends) {
  const to = Array.isArray(sends.publishesTo) ? sends.publishesTo : sends.publishes ? ['npm'] : [];
  const packages = (Array.isArray(sends.packages) ? sends.packages : []).filter((entry) => entry.name == null || entry.dir !== '');
  const bare = to.filter((name) => name !== IMAGE && !packages.some((entry) => entry.registry === name));
  const items = [];
  if (bare.length > 0) items.push({ text: `to ${registryList(bare)}`, compound: bare.length > 1 });
  for (const name of to.filter((registry) => registry !== IMAGE && !bare.includes(registry))) {
    const where = REGISTRIES[name] ?? name;
    const entries = packages.filter((entry) => entry.registry === name);
    const named = entries.filter((entry) => entry.name != null);
    if (named.length > 0) items.push({ text: `${list(named.map((entry) => (entry.dir ? `${entry.name} (${entry.dir})` : entry.name)))} to ${where}`, compound: named.length > 1 });
    for (const entry of entries.filter((item) => item.name == null)) items.push({ text: `${chosenPackage(entry)} to ${where}${chosenBy(entry)}`, compound: entry.chosenBy != null });
  }
  if (to.includes(IMAGE)) items.push({ text: 'a container image', compound: false });
  if (items.length === 0) return null;
  if (items.length === 1) return `publishes ${items[0].text}`;
  const plain = items.length === 2 && !items.some((item) => item.compound);
  const head = items.slice(0, -1).map((item) => item.text).join(', ');
  return `publishes ${head}${plain ? ' and ' : ', and '}${items[items.length - 1].text}`;
}

/**
 * What a door sends out of the repository. A commit made in a clone of
 * another repository leaves this one, so it is said here, by the repository
 * cloned; a clone whose repository the map cannot name is not said at all,
 * and neither is ever a stage of this repository.
 *
 * @param {object} door
 * @returns {string[]}
 */
export function sendPhrases(door) {
  const sends = door.sends ?? {};
  const phrases = [];
  const clones = new Map();
  for (const entry of door.elsewhere ?? []) {
    if (entry.clone == null || (entry.stages ?? []).length === 0) continue;
    clones.set(entry.clone, (clones.get(entry.clone) ?? false) || entry.pushes === true);
  }
  for (const [clone, pushed] of [...clones.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    phrases.push(`commits into a clone of ${clone}${pushed ? ' and pushes there' : ''}`);
  }
  for (const repo of sends.dispatchesTo ?? []) phrases.push(`sends a dispatch to ${repo}`);
  const published = publishPhrase(sends);
  if (published) phrases.push(published);
  if (sends.releases) phrases.push('creates a GitHub release');
  if (sends.deploysPages) phrases.push('deploys the site');
  if (sends.opensIssues) phrases.push(sends.opensIssuesOnFailure ? 'opens an issue when it fails' : 'opens an issue');
  if (sends.opensPullRequests) phrases.push('opens a pull request');
  if (sends.changesRepositories) phrases.push('changes other repositories through the GitHub API');
  // A job held to one trigger says which: "deploys the site on a push to main".
  for (const entry of door.gated ?? []) {
    const when = gatePhrase(entry.when);
    const stages = stagedShown(entry.stages);
    if (stages.length > 0) phrases.push(`commits ${commitsClause({ stages: entry.stages, pushes: entry.pushes, pushesForReview: entry.pushesForReview, pushesTo: entry.pushesTo })} ${when}`);
    for (const phrase of sendPhrases({ sends: sendsFrom(entry.sends) })) phrases.push(`${phrase} ${when}`);
  }
  return phrases;
}

/**
 * The trigger a gated job runs on, worded as the page words triggers.
 *
 * @param {{ event?: string, branches?: string[], tags?: boolean }} when
 * @returns {string}
 */
export function gatePhrase(when) {
  const inputs = inputWords(when.inputs);
  if (inputs) {
    // Inputs hold only a run by hand; on its own an input's condition leaves
    // every other trigger, which is said once, in parentheses.
    if (when.event === 'workflow_dispatch') return `when run by hand with ${inputs}`;
    if (!when.event && !when.tags && !(when.branches?.length > 0) && !(when.except?.length > 0)) return `(on a run by hand, only with ${inputs})`;
  }
  const branches = when.branches?.length > 0 ? list(when.branches).replace(/ and /g, ' or ') : null;
  if (when.tags) return 'on a tag push';
  if (when.event === 'push') return branches ? `on a push to ${branches}` : 'on a push';
  const phrase = (event) => GATE_EVENTS[event] ?? `on a \`${event}\` event`;
  if (!when.event && when.except?.length > 0) {
    const held = `except ${list(when.except.map(phrase)).replace(/ and /g, ' or ')}`;
    return branches ? `on ${branches}, ${held}` : held;
  }
  if (!when.event) return `on ${branches}`;
  return branches ? `${phrase(when.event)} to ${branches}` : phrase(when.event);
}

// The trigger a gated run is said under, as the lead of its sentence.
function gateLead(when) {
  const phrase = gatePhrase(when);
  return phrase.startsWith('(') ? `on a run by hand with ${inputWords(when.inputs)}` : phrase;
}

// The inputs a run by hand needs: "dry_run false", "mode full".
export function inputWords(inputs) {
  if (inputs == null || typeof inputs !== 'object') return null;
  const names = Object.keys(inputs).sort(cmp);
  if (names.length === 0) return null;
  return list(names.map((name) => `${name} ${inputs[name]}`));
}

const GATE_EVENTS = {
  pull_request: 'on a pull request',
  pull_request_target: 'on a pull request',
  schedule: 'on a schedule',
  workflow_dispatch: 'when run by hand',
  release: 'on a release event',
  repository_dispatch: 'when a repository sends a dispatch',
};

// A gated job's send keys read back into the shape sendPhrases reads.
function sendsFrom(keys) {
  const sends = { dispatchesTo: [], packages: [], publishesTo: [] };
  for (const key of keys ?? []) {
    const at = key.indexOf(':');
    if (at === -1) sends[key] = true;
    else if (key.slice(0, at) === 'packages') sends.packages.push(JSON.parse(key.slice(at + 1)));
    else sends[key.slice(0, at)].push(key.slice(at + 1));
  }
  return sends;
}

/**
 * Up to three paths by name, and how many more. `total` is the number of
 * paths the door runs when its recorded list was capped, so the count is the
 * true one.
 */
export function runsShown(paths, total = paths.length) {
  const all = Math.max(total, paths.length);
  if (all <= RUNS_SHOWN) return list(paths);
  const shown = paths.slice(0, RUNS_SHOWN);
  return `${shown.join(', ')} and ${all - shown.length} more`;
}

// How many runs of a kind the page would name without the artifact's cap:
// the ones it names, and the ones the artifact counted but did not record.
function runTotal(door, kind = null) {
  const kinds = runKinds(door);
  const recorded = runPaths(door).filter((path) => kind == null || kinds.get(path) === kind).length;
  const held = [...heldRuns(door).keys()].filter((path) => kind == null || kinds.get(path) === kind).length;
  const checks = door.checksCount ?? 0;
  let counted = door.runsCount ?? recorded;
  if (door.runsCount != null && kind === 'checks') counted = checks;
  else if (door.runsCount != null && kind === 'executes') counted = door.runsCount - checks;
  return shownRuns(door, kind).length + Math.max(0, counted - held - recorded);
}

/**
 * Up to three paths by name, and how many files the rest stand for: a
 * directory run counts every code file under it, so "and 37 more" adds up
 * with "50 files in tests". `unrecorded` is how many runs the artifact
 * counted past the ones it recorded, each one more.
 */
function filesShown(ctx, paths, unrecorded = 0) {
  const more = moreFiles(ctx, paths, unrecorded);
  if (more === 0) return list(paths);
  return `${paths.slice(0, RUNS_SHOWN).join(', ')} and ${more} more`;
}

// The files past the first three paths, and the unrecorded runs.
function moreFiles(ctx, paths, unrecorded = 0) {
  const files = (path) => (path.endsWith('/') ? Math.max(1, [...ctx.fileOf.keys()].filter((file) => file.startsWith(path) && isCodePath(file)).length) : 1);
  return paths.slice(RUNS_SHOWN).reduce((sum, path) => sum + files(path), 0) + Math.max(0, unrecorded);
}

// The runs of a kind the artifact counted but did not record.
function unrecordedRuns(door, kind) {
  return Math.max(0, runTotal(door, kind) - shownRuns(door, kind).length);
}

// What an installed door runs when its manifest points at a build's output
// that no tracked config traces to a source: the path, said as that.
export function unplacedClause(verb, path) {
  return `${verb} ${path}, built from a source this map cannot place`;
}

// "runs X; checks Y", or null when the door names no file at all.
function runsAndChecks(ctx, door, verb) {
  if (door.unplaced) return unplacedClause(verb, door.unplaced);
  const clauses = [];
  const ran = shownRuns(door, 'executes');
  const checked = shownRuns(door, 'checks');
  if (ran.length > 0) clauses.push(`${verb} ${filesShown(ctx, ran, unrecordedRuns(door, 'executes'))}`);
  if (checked.length > 0) clauses.push(`checks ${filesShown(ctx, checked, unrecordedRuns(door, 'checks'))}`);
  return clauses.length > 0 ? clauses.join('; ') : null;
}

function comesIn(ctx) {
  const lines = ['## What comes in'];
  const items = ctx.doors.map((door, index) => {
    if (door.parseError) return `${index + 1}. **${door.name}.** This workflow could not be read.`;
    const named = runsAndChecks(ctx, door, startVerb(door));
    const held = heldSentences(ctx, door, startVerb(door), named != null);
    const runs = [...(named || held.length === 0 ? [capitalize(named ? `${named}.` : `${startVerb(door)} no file this map can see.`)] : []), ...held].join(' ');
    if (installed(door)) return `${index + 1}. **${door.name}** (${installedAs(door)}). ${runs}`;
    const when = capitalize(triggerPhrases(door).join('; ')) || 'Nothing this map can read starts it';
    return `${index + 1}. **${door.name}.** ${when}. ${runs}`;
  });
  lines.push(items.join('\n'));
  return lines.join('\n\n');
}

function fileCount(ctx, entry) {
  return `${ctx.shown(entry.boundary)} (${count(entry.files, 'file')})`;
}

// The part a run belongs to: a file's own, or the one part every code file
// under a directory run belongs to. A directory spanning parts has none.
function runPart(ctx, path) {
  if (!path.endsWith('/')) return ctx.boundaryOf.get(path) ?? null;
  const parts = partsUnder(ctx, path);
  return parts.size === 1 ? [...parts][0] : null;
}

function partsUnder(ctx, dir) {
  const parts = new Set();
  for (const [file, boundary] of ctx.boundaryOf) if (file.startsWith(dir)) parts.add(boundary);
  return parts;
}

// A directory run that spans parts says how many, since the parts it runs
// are not listed anywhere else in the step.
function spanning(ctx, path) {
  const parts = path.endsWith('/') ? partsUnder(ctx, path).size : 0;
  return parts > 1 ? `${path} (${count(parts, 'part')})` : path;
}

// The files a set of runs stands for: each file, and the code files under
// each directory, the ones the reach walk starts from.
function filesRun(ctx, paths) {
  const files = new Set();
  for (const path of paths) {
    if (!path.endsWith('/')) files.add(path);
    else for (const file of ctx.fileOf.keys()) if (file.startsWith(path) && isCodePath(file)) files.add(file);
  }
  return files.size;
}

// More than three runs in one part are named by the files they add up to in
// that part, so a door that runs a test suite does not list every test. A
// suite that spans more than six parts would still list every part, so the
// parts holding a file the commands name come first, as they do in "What
// comes in", and past the fifth the rest are counted.
function runGroups(ctx, door, paths) {
  const groups = new Map();
  for (const path of paths) {
    const boundary = runPart(ctx, path);
    const key = boundary ?? `\0${path}`;
    if (!groups.has(key)) groups.set(key, { boundary, paths: [] });
    groups.get(key).paths.push(path);
  }
  const order = new Map((door.reach ?? []).map((entry, index) => [entry.boundary, index]));
  let ordered = [...groups.values()].sort((a, b) => (
    (order.get(a.boundary) ?? Infinity) - (order.get(b.boundary) ?? Infinity) || cmp(a.paths[0], b.paths[0])
  ));
  let rest = [];
  if (ordered.length > GROUPS_SHOWN) {
    const named = new Set((door.runs ?? []).filter((run) => !run.matched).map((run) => run.path));
    const holdsNamed = (group) => group.paths.some((path) => named.has(path));
    ordered = [...ordered.filter(holdsNamed), ...ordered.filter((group) => !holdsNamed(group))];
    rest = ordered.slice(GROUPS_SHOWN - 1);
    ordered = ordered.slice(0, GROUPS_SHOWN - 1);
  }
  const parts = ordered.map((group) => {
    if (!group.boundary) return list(group.paths.map((path) => spanning(ctx, path)));
    const named = group.paths.length > RUNS_SHOWN ? count(filesRun(ctx, group.paths), 'file') : list(group.paths);
    return `${named} in ${ctx.shown(group.boundary)}`;
  });
  if (rest.length > 0) {
    const places = rest.every((group) => group.boundary) ? 'part' : 'place';
    parts.push(`${count(filesRun(ctx, rest.flatMap((group) => group.paths)), 'file')} in ${rest.length} more ${places}s`);
  }
  return list(parts, { serial: ordered.some((group) => group.paths.length > 1) || rest.length > 0 });
}

function deeper(door) {
  const depths = new Map();
  for (const entry of door.reach ?? []) {
    if (entry.depth < 1) continue;
    if (!depths.has(entry.depth)) depths.set(entry.depth, []);
    depths.get(entry.depth).push(entry);
  }
  return [...depths.entries()].sort((a, b) => a[0] - b[0]).map(([depth, entries]) => ({
    depth,
    entries: [...entries].sort((a, b) => cmp(a.boundary, b.boundary)),
  }));
}

function writes(ctx, door) {
  return cover(door.landings ?? []).map(ctx.place);
}

function doorSteps(ctx, door) {
  const steps = [];
  const ran = shownRuns(door, 'executes');
  const checked = shownRuns(door, 'checks');
  const subject = installed(door) ? `The ${door.extension ? 'extension' : door.kind} ${startVerb(door)}` : 'The workflow runs';
  const clauses = [];
  if (ran.length > 0) clauses.push(`${subject} ${runGroups(ctx, door, ran)}`);
  if (checked.length > 0) clauses.push(`${ran.length > 0 ? 'it' : 'The workflow'} checks ${runGroups(ctx, door, checked)}`);
  const held = heldSentences(ctx, door, 'runs', clauses.length > 0);
  if (clauses.length > 0 || held.length === 0) steps.push(clauses.length > 0 ? `${clauses.join('; ')}.` : `${subject} no file this map can see.`);
  steps.push(...held);
  for (const level of deeper(door)) steps.push(`That reaches ${list(level.entries.map((entry) => fileCount(ctx, entry)))}.`);
  const places = writes(ctx, door);
  if (places.length > 0) steps.push(`It writes to ${list(places)}.`);
  if ((door.stages ?? []).length > 0) steps.push(`It commits ${commitsClause(door)}.`);
  // git and gh from outside the repository, which its code starts.
  if ((door.programs ?? []).length > 0) steps.push(`It runs ${list(door.programs)}.`);
  for (const phrase of sendPhrases(door)) steps.push(`It ${phrase}.`);
  return steps;
}

// An identifier read as words: loadGlobalPolicy is "load global policy".
export function words(identifier) {
  return String(identifier)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .replace(/[_$.\-\s]+/g, ' ')
    .trim()
    .toLowerCase();
}

// A file is named by its stem, or by its directory when the stem is an index.
function filePhrase(path) {
  const parts = path.split('/');
  const stem = parts[parts.length - 1].replace(/\.[^.]+$/, '');
  const named = (stem === 'index' || stem === '__init__') && parts.length > 1 ? parts[parts.length - 2] : stem;
  return words(named);
}

// The name the page gives a part, carried in page.json so a reader of the
// twin never has to reproduce displayName.
function label(ctx, part) {
  return part == null ? null : ctx.shown(part);
}

function partOf(ctx, target) {
  if (target?.file) return ctx.boundaryOf.get(target.file) ?? null;
  return target?.boundary ?? null;
}

// The steps a sequence shows. A function only handed to another call is not
// known to run there, so it is kept in the artifact and left off the page.
function stepUnits(ctx, calls) {
  const shown = calls.filter((call) => !call.passed && call.branch == null);
  const units = [];
  for (let i = 0; i < shown.length;) {
    const file = shown[i].target?.file ?? null;
    let end = i + 1;
    while (file != null && end < shown.length && shown[end].target?.file === file) end += 1;
    if (end - i >= RUN_COLLAPSE) {
      const part = partOf(ctx, shown[i].target);
      units.push({ count: end - i, name: null, part, partLabel: label(ctx, part), phrase: filePhrase(file) });
      i = end;
      continue;
    }
    const part = partOf(ctx, shown[i].target);
    const unit = { name: shown[i].name, part, partLabel: label(ctx, part), phrase: words(shown[i].name) };
    if (shown[i].receiver != null) unit.receiver = shown[i].receiver;
    units.push(unit);
    i += 1;
  }
  return { units, calls: shown.length };
}

// A method called on an object is named with the object's class, "train
// (Trainer)". Another part is named after the first step that goes into it,
// once.
function unitTexts(ctx, units, ownPart) {
  const named = new Set();
  return units.map((unit) => {
    const notes = [];
    if (unit.receiver != null) notes.push(unit.receiver);
    if (unit.part != null && unit.part !== ownPart && !named.has(unit.part)) {
      named.add(unit.part);
      notes.push(ctx.shown(unit.part));
    }
    if (unit.count) notes.push(`${unit.count} steps`);
    return notes.length > 0 ? `${unit.phrase} (${notes.join(', ')})` : unit.phrase;
  });
}

// The other ways a function goes, each an early return's branch with the
// calls it makes, in the order the branches come.
function alternativesOf(ctx, calls) {
  const byCondition = new Map();
  for (const call of calls) {
    if (call.branch == null || call.passed) continue;
    if (!byCondition.has(call.branch)) byCondition.set(call.branch, []);
    byCondition.get(call.branch).push({ ...call, branch: undefined });
  }
  return [...byCondition.entries()]
    .map(([when, list]) => ({ when, steps: stepUnits(ctx, list).units }))
    .filter((alternative) => alternative.steps.length > 0);
}

function inOrder(lead, texts, indent) {
  if (texts.length <= SENTENCE_STEPS) return `${lead} ${list(texts)}.`;
  const items = texts.slice(0, LISTED_STEPS).map((text, index) => `${indent}${SUB_INDENT}${index + 1}. ${text}`);
  if (texts.length > LISTED_STEPS) items[items.length - 1] += `, and ${texts.length - LISTED_STEPS} more`;
  return [lead, ...items].join('\n');
}

/**
 * The order of work inside the files the main door runs: each file's entry
 * function, and one level into each file that function calls, when there are
 * at least two steps to put in order. A called function is followed when it
 * has three steps to show or lives in another part than the entry's file,
 * since two steps inside the same part add little to the entry's own line.
 * The five with the most steps are kept, in the order the entry calls them.
 */
function sequences(ctx, door) {
  const out = [];
  const held = heldRuns(door);
  const named = [...new Set((door.runs ?? []).filter((run) => !run.matched && run.runKind !== 'checks' && !held.has(run.path)).map((run) => run.path))].sort(cmp);
  for (const path of named) {
    const file = ctx.fileOf.get(path);
    const root = (file?.sequences ?? []).find((sequence) => sequence.name === file.entry);
    if (!root) continue;
    const steps = stepUnits(ctx, root.calls);
    if (steps.calls < 2) continue;
    const part = ctx.boundaryOf.get(path) ?? null;
    const candidates = [];
    for (const call of root.calls) {
      if (call.passed || !call.inner) continue;
      const innerSteps = stepUnits(ctx, call.inner);
      if (innerSteps.calls < 2) continue;
      const target = partOf(ctx, call.target);
      if (innerSteps.units.length < INNER_STEPS && target === part) continue;
      candidates.push({
        file: call.target?.file ?? null,
        name: call.name,
        part: target,
        partLabel: label(ctx, target),
        phrase: words(call.name),
        steps: innerSteps.units,
      });
    }
    const kept = new Set(candidates
      .map((item, index) => ({ item, index }))
      .sort((a, b) => b.item.steps.length - a.item.steps.length || a.index - b.index)
      .slice(0, INNER_SHOWN)
      .map(({ item }) => item));
    const inner = candidates.filter((item) => kept.has(item));
    const alternatives = alternativesOf(ctx, root.calls);
    out.push({ ...(alternatives.length > 0 ? { alternatives } : {}), entry: file.entry, file: path, inner, part, partLabel: label(ctx, part), phrase: words(file.entry), steps: steps.units });
  }
  return out;
}

function sequenceLines(ctx, found) {
  const lines = [];
  for (const sequence of found) {
    lines.push(inOrder(`Inside ${sequence.file}, ${sequence.phrase} does, in order:`, unitTexts(ctx, sequence.steps, sequence.part), SUB_INDENT));
    const alternatives = sequence.alternatives ?? [];
    for (const alternative of alternatives.slice(0, ALTERNATIVES_SHOWN)) {
      lines.push(`Or, when \`${alternative.when}\`, ${sequence.phrase} does ${list(unitTexts(ctx, alternative.steps, sequence.part))} instead.`);
    }
    if (alternatives.length > ALTERNATIVES_SHOWN) lines.push(`${capitalize(sequence.phrase)} returns early ${count(alternatives.length - ALTERNATIVES_SHOWN, 'more way')}.`);
    for (const inner of sequence.inner) {
      const where = inner.part != null ? (inner.part === sequence.part ? null : ctx.shown(inner.part)) : inner.file;
      const lead = `**${capitalize(inner.phrase)}**${where ? ` (${where})` : ''} runs, in order:`;
      lines.push(inOrder(lead, unitTexts(ctx, inner.steps, inner.part), SUB_INDENT));
    }
  }
  return lines.map((line, index) => `${SUB_INDENT}${index + 1}. ${line}`);
}

function happens(ctx, main, found) {
  const steps = doorSteps(ctx, main).map((step, index) => `${index + 1}. ${step}`);
  const inside = sequenceLines(ctx, found);
  if (inside.length > 0) steps[0] = [steps[0], ...inside].join('\n');
  return [`## What happens through ${main.name}`, steps.join('\n')].join('\n\n');
}

function nounOf(paths) {
  const stems = new Set(paths.map((path) => path.slice(path.lastIndexOf('/') + 1).split('.')[0]));
  const [stem] = [...stems];
  return stems.size === 1 && stem ? `${stem} files` : 'files';
}

// More than three files from one part read or write a place: name the part
// with the count, since the file list would bury every other name. A named
// part is kept as its id, so the page and page.json can each word it. Tests
// that read a place are counted apart from the code that does, and say so.
function collapse(ctx, entries) {
  const byBoundary = new Map();
  const loose = [];
  for (const entry of entries) {
    const boundary = ctx.boundaryOf.get(entry.path);
    if (!boundary) {
      loose.push(entry);
      continue;
    }
    const key = `${boundary}\0${entry.fromTests ? 1 : 0}`;
    if (!byBoundary.has(key)) byBoundary.set(key, { boundary, fromTests: entry.fromTests === true, members: [] });
    byBoundary.get(key).members.push(entry);
  }
  const items = [...loose.map((entry) => ({ key: entry.path, text: entry.text }))];
  for (const { boundary, fromTests, members } of byBoundary.values()) {
    if (members.length > COLLAPSE_OVER) {
      const paths = members.map((entry) => entry.path).sort(cmp);
      items.push({ key: paths[0], boundary, files: `${members.length} ${nounOf(paths)}${fromTests ? ', from tests' : ''}` });
    } else {
      for (const entry of members) items.push({ key: entry.path, text: entry.text });
    }
  }
  return items.sort((a, b) => cmp(a.key, b.key));
}

function worded(items, name) {
  return items.map((item) => item.text ?? `${name(item.boundary)} (${item.files})`);
}

// A reader is found by text only when every read it makes of the place is. A
// test is a reader from tests.
function readerFiles(entries) {
  const byPath = new Map();
  const config = new Map();
  const tests = new Set();
  for (const entry of entries) {
    const text = entry.confidence === 'text';
    const configures = entry.confidence === 'config';
    byPath.set(entry.by, byPath.has(entry.by) ? byPath.get(entry.by) && text : text);
    config.set(entry.by, config.has(entry.by) ? config.get(entry.by) && configures : configures);
    if (entry.fromTests) tests.add(entry.by);
  }
  return [...byPath.entries()].sort((a, b) => cmp(a[0], b[0])).map(([path, text]) => ({
    path,
    text,
    ...(config.get(path) ? { config: true } : {}),
    ...(tests.has(path) ? { fromTests: true } : {}),
  }));
}

/**
 * A reader as the page names it: "(found by text)" when every read is,
 * "(from configuration)" for a configuration that names the place, and
 * "(from tests)" for a test.
 *
 * @param {{ path: string, text: boolean, config?: boolean, fromTests?: boolean }} reader
 */
export function readerItem(reader) {
  const mark = reader.text ? ' (found by text)' : reader.config ? ' (from configuration)' : reader.fromTests ? ' (from tests)' : '';
  return { path: reader.path, text: `${reader.path}${mark}`, ...(reader.fromTests ? { fromTests: true } : {}) };
}

// The part a landing is in: a tracked file's own, the one part a directory
// holds, or for a file made at run time, the one part its directory holds.
function landingPart(ctx, target) {
  if (ctx.boundaryOf.has(target)) return ctx.boundaryOf.get(target);
  const one = (dir) => {
    const parts = partsUnder(ctx, `${dir}/`);
    return parts.size === 1 ? [...parts][0] : null;
  };
  return one(target) ?? (target.includes('/') ? one(target.slice(0, target.lastIndexOf('/'))) : null);
}

// The deepest directory every target lies in or is: a directory stands for
// itself, a file for the directory holding it. Empty at the top of the tree.
function commonDirectory(ctx, targets) {
  const dirs = targets.map((target) => {
    const segments = target.split('/');
    return ctx.place(target).endsWith('/') ? segments : segments.slice(0, -1);
  });
  let length = 0;
  while (dirs.every((segments) => segments.length > length && segments[length] === dirs[0][length])) length += 1;
  return dirs[0].slice(0, length).join('/');
}

/**
 * A door's landings grouped by the place they share: the landings in one part
 * under the deepest directory they have in common, so receipts written into
 * a package's scripts/ are named as scripts/, not the package they sit in. One
 * landing is its own group, a file named as the file. Landings that share no
 * directory short of the top of the tree, or belong to no single part, keep a
 * group each. A directory that holds more than one part (packages/ in a
 * workspace) is where the parts live, so it is never a group.
 *
 * @returns {Map<string, string>} each landing's group
 */
function landingGroups(ctx, landings) {
  const byPart = new Map();
  for (const target of landings) {
    const part = landingPart(ctx, target);
    const key = part ?? `\0${target}`;
    if (!byPart.has(key)) byPart.set(key, []);
    byPart.get(key).push(target);
  }
  const groupOf = new Map();
  for (const targets of byPart.values()) {
    const shared = targets.length > 1 ? commonDirectory(ctx, targets) : '';
    for (const target of targets) groupOf.set(target, shared !== '' && ctx.partsUnder(shared) <= 1 ? shared : target);
  }
  return groupOf;
}

function readerGroups(ctx, main) {
  const groups = new Map();
  const groupOf = landingGroups(ctx, main.landings ?? []);
  for (const key of groupOf.values()) {
    if (!groups.has(key)) groups.set(key, { key, entries: [] });
  }
  for (const entry of (main.readers ?? []).filter(strong)) {
    const group = groups.get(groupOf.get(entry.target));
    if (group) group.entries.push(entry);
  }
  const out = [];
  for (const group of [...groups.values()].sort((a, b) => cmp(a.key, b.key))) {
    const target = ctx.place(group.key);
    if (group.entries.length === 0) {
      out.push({ target, readers: [], files: [], tests: 0 });
      continue;
    }
    // The door naming its own output, a writer reading back what it wrote, and
    // files kept inside that output are the making of the result, not a use
    // of it. The page leaves them out; the artifact keeps the reads.
    const writers = new Set(ctx.landings
      .filter((landing) => under(landing.target, group.key))
      .flatMap((landing) => landing.writers.map((entry) => entry.by)));
    const files = readerFiles(group.entries).filter((reader) => (
      reader.path !== main.file && !writers.has(reader.path) && !under(reader.path, group.key)
    ));
    if (files.length === 0) continue;
    // The tests that read a place are counted after the code that does, the
    // way a part imported only from tests is; a place one test alone reads
    // names it.
    const code = files.filter((reader) => !reader.fromTests);
    const tests = files.length - code.length;
    const alone = code.length === 0 && tests === 1;
    const readers = collapse(ctx, (alone ? files : code).map(readerItem));
    out.push({ target, readers, files, entries: group.entries, tests: alone ? 0 : tests });
  }
  return out;
}

/**
 * A sentence that says nothing does something holds only for the files the
 * parser read, so when some could not be read it says which it covers and
 * how many it does not: "CI writes nothing in the files this map could read;
 * 2 files could not be."
 *
 * @param {'writes'|'breaks'|'unread'|'duplicates'|'generated'|'authored'} kind
 * @param {number} unread how many files the parser could not read
 * @param {string} [subject] the door, or the places people write
 * @returns {string}
 */
export function absence(kind, unread, subject = '') {
  const not = unread > 0 ? `; ${count(unread, 'file')} could not be` : '';
  const within = unread > 0 ? ' in the files this map could read' : '';
  switch (kind) {
    case 'writes': return unread > 0 ? `${subject} writes nothing${within}${not}.` : `${subject} writes nothing this map can see.`;
    case 'breaks': return `No part is imported by another part${within}, and no part sits on the path of two doors${not}.`;
    case 'unread': return unread > 0 ? `No place is written by the files this map could read, so none goes unread${not}.` : 'No place this map can see is written, so none goes unread.';
    case 'duplicates': return `No two parts export a helper that looks alike${within}${not}.`;
    case 'generated': return unread > 0 ? `Nothing${within} writes to a tracked place${not}.` : 'Nothing in this repository writes to a tracked place this map can see.';
    default: return unread > 0 ? `${subject}. Nothing${within} writes to them${not}.` : `${subject}. Nothing in this repository writes to them.`;
  }
}

// The files the parser could not read, which every absence the page states
// is qualified by.
function unreadCount(ctx) {
  return ctx.boundaries.reduce((sum, boundary) => sum + (boundary.files ?? []).filter((file) => file.parseError).length, 0);
}

function readsSection(ctx, main, groups) {
  const lines = ['## Who reads the results'];
  if ((main.landings ?? []).length === 0) {
    lines.push(absence('writes', unreadCount(ctx), main.name));
    return lines.join('\n\n');
  }
  const bullets = groups.map((group) => {
    if (group.readers.length === 0 && !group.tests) return `- **${group.target}** has no reader in this repository.`;
    return `- **${group.target}** is read by ${readersClause(worded(group.readers, ctx.shown), group.tests)}.`;
  });
  lines.push(bullets.length > 0 ? bullets.join('\n') : `Only ${main.name} itself reads what it writes.`);
  return lines.join('\n\n');
}

/**
 * The readers of a place as the page words them: the code that reads it, then
 * how many tests do, "A and B, and by 3 tests", or the tests alone.
 *
 * @param {string[]} readers
 * @param {number} tests
 * @returns {string}
 */
export function readersClause(readers, tests) {
  if (!tests) return list(readers);
  if (readers.length === 0) return count(tests, 'test');
  return `${list(readers)}, and by ${count(tests, 'test')}`;
}

function otherDoors(ctx, main) {
  const rest = ctx.doors.filter((door) => door !== main);
  if (rest.length === 0) return null;
  const paragraphs = rest.map((door) => {
    if (door.parseError) return `**${door.name}.** This workflow could not be read.`;
    const clauses = [];
    const verb = startVerb(door);
    const ran = shownRuns(door, 'executes');
    const checked = shownRuns(door, 'checks');
    const groups = gatedRuns(door);
    if (door.unplaced) clauses.push(unplacedClause(verb, door.unplaced));
    else if (ran.length > 0 || (checked.length === 0 && groups.length === 0)) {
      clauses.push(ran.length > 0 ? `${verb} ${filesShown(ctx, ran, unrecordedRuns(door, 'executes'))}` : `${verb} no file this map can see`);
    }
    if (checked.length > 0) clauses.push(`checks ${filesShown(ctx, checked, unrecordedRuns(door, 'checks'))}`);
    for (const group of groups) {
      const clause = heldClause(ctx, door, group, verb, ' and ');
      if (clause) clauses.push(`${clause} ${gatePhrase(group.when)}`);
    }
    const reached = [...new Set(deeper(door).flatMap((level) => level.entries.map((entry) => entry.boundary)))].sort(cmp);
    if (reached.length > 0) clauses.push(`reaches ${list(reached.map(ctx.shown))}`);
    const places = writes(ctx, door);
    if (places.length > 0) clauses.push(`writes to ${list(places)}`);
    const stages = door.stages ?? [];
    if (stages.length > 0) clauses.push(`commits ${commitsClause(door)}`);
    if ((door.programs ?? []).length > 0) clauses.push(`runs ${list(door.programs)}`);
    clauses.push(...sendPhrases(door));
    const named = installed(door) ? `**${door.name}** (${installedAs(door)})` : `**${door.name}**`;
    return `${named} ${clauseList(clauses)}.`;
  });
  return ['## The other doors', paragraphs.join('\n\n')].join('\n\n');
}

// The parts that import each part in production code. A part imported only
// from test files is needed to test the other part, not to run it, so it is
// counted apart (testImporters) and orders nothing.
function importers(ctx, { tests = false } = {}) {
  const from = new Map(ctx.boundaries.map((boundary) => [boundary.name, new Set()]));
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from === edge.to || Boolean(edge.fromTests) !== tests) continue;
    if (!from.has(edge.to)) from.set(edge.to, new Set());
    from.get(edge.to).add(edge.from);
  }
  return from;
}

// The parts whose code calls each part over HTTP.
function callers(ctx) {
  const from = new Map();
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'http' || edge.from === edge.to) continue;
    if (!from.has(edge.to)) from.set(edge.to, new Set());
    from.get(edge.to).add(edge.from);
  }
  return from;
}

// The parts whose production code runs each part's files as a child process.
function spawners(ctx) {
  const from = new Map();
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'spawns' || edge.from === edge.to || edge.fromTests) continue;
    if (!from.has(edge.to)) from.set(edge.to, new Set());
    from.get(edge.to).add(edge.from);
  }
  return from;
}

function testImporters(ctx) {
  const production = importers(ctx);
  const tests = importers(ctx, { tests: true });
  for (const [part, parts] of tests) for (const name of production.get(part) ?? []) parts.delete(name);
  return tests;
}

function doorsThrough(ctx) {
  const on = new Map();
  for (const door of ctx.doors) {
    if (door.parseError) continue;
    for (const boundary of new Set((door.reach ?? []).map((entry) => entry.boundary))) {
      on.set(boundary, (on.get(boundary) ?? 0) + 1);
    }
  }
  return on;
}

/**
 * The places something writes, each with its writers and the files that read
 * it. A written place under another is part of it when one writer writes both,
 * or when a door commits the outer place whole. A file one script writes
 * inside a directory another script writes into is its own place, so a
 * receipt kept beside another script's output keeps its own line. Every
 * landing is counted with the deepest place that holds it.
 *
 * A Markdown page or a JSON file that quotes a path is evidence for a person,
 * not a use anything runs: it is left out here, so it never makes a place
 * read or a hand edit reach it, and the readers section names it as found by
 * text. A shell script or an HTML page found by text runs what it names, and
 * stays a reader.
 */
function writtenPlaces(ctx) {
  const written = ctx.landings.filter((landing) => landing.writers.length > 0);
  const writersOf = new Map(written.map((landing) => [landing.target, new Set(landing.writers.map((entry) => entry.by))]));
  const doorFiles = new Set(ctx.doors.map((door) => door.file));
  const holds = (outer, inner) => [...writersOf.get(outer)].some((by) => doorFiles.has(by) || writersOf.get(inner).has(by));
  const targets = written.map((landing) => landing.target).sort(cmp);
  const kept = targets.filter((target) => !targets.some((other) => other !== target && under(target, other) && holds(other, target)));
  const holder = (path) => kept.filter((target) => under(path, target)).sort((a, b) => b.length - a.length)[0] ?? null;
  const held = new Map(kept.map((target) => [target, []]));
  for (const landing of ctx.landings) {
    const target = holder(landing.target);
    if (target != null) held.get(target).push(landing);
  }
  return kept.map((target) => {
    const inside = held.get(target);
    const writers = [...new Set(inside.flatMap((landing) => landing.writers.map((entry) => entry.by)))].sort(cmp);
    // A workflow that names a place it also writes is describing its own output.
    const reads = inside.flatMap((landing) => landing.readers)
      .filter((entry) => !quotedOnly(entry) && (entry.call != null || !writers.includes(entry.by)));
    const readers = readerFiles(reads).filter((reader) => !under(reader.path, target));
    // Every writer reading the file first is a script stamping a block of a
    // file people write, not a generator of the file.
    const stamped = inside.length > 0 && inside.every((landing) => landing.writers.length > 0 && landing.writers.every((entry) => entry.stamps));
    // A writer that only bootstraps the file, once when it is absent, reads
    // the committed file every other time: its reads are a use of it.
    const once = [...new Set(inside.flatMap((landing) => landing.writers.filter((entry) => (entry.unless ?? []).includes('exists')).map((entry) => entry.by)))];
    return { target, writers, readers, guards: guardsOf(inside), once, ...(stamped ? { stamped: true } : {}) };
  });
}

// The guards that kept a door from each writer's write, by writer: a writer
// is guarded here only when every write of it inside the place is.
function guardsOf(landings) {
  const by = new Map();
  for (const landing of landings) {
    for (const entry of landing.writers) {
      const unless = entry.unless ?? [];
      by.set(entry.by, by.has(entry.by) ? by.get(entry.by).filter((guard) => unless.includes(guard)) : [...unless]);
    }
  }
  return by;
}

/**
 * What a writer's guards make of "written by X": "when run outside CI", "when
 * run without --selftest", or nothing when no door was kept from the write.
 *
 * @param {string[]} guards
 * @returns {string}
 */
export function guardClause(guards) {
  const flags = (guards ?? []).filter((guard) => guard !== 'ci' && guard !== 'exists');
  const parts = [];
  if ((guards ?? []).includes('ci')) parts.push('outside CI');
  if (flags.length > 0) parts.push(`without ${list(flags).replace(/ and /g, ' or ')}`);
  const run = parts.length > 0 ? ` when run ${parts.join(' and ')}` : '';
  return (guards ?? []).includes('exists') ? `${run} when absent` : run;
}

// A test that writes a tracked place is said to be one: the place changes
// every time the suite runs.
function writerItems(ctx, writers, guards) {
  return collapse(ctx, writers.map((path) => ({ path, text: `${path}${isTestFile(path) ? ' (a test)' : ''}${guardClause(guards.get(path))}` })));
}

const QUOTING = /\.(md|mdx|json|jsonl)$/i;

function quotedOnly(entry) {
  return entry.confidence === 'text' && QUOTING.test(entry.by);
}

function partsOf(ctx, paths) {
  return [...new Set(paths.map((path) => ctx.boundaryOf.get(path) ?? path))].sort(cmp);
}

function breaks(ctx) {
  const from = importers(ctx);
  const fromTests = testImporters(ctx);
  const spawnedBy = spawners(ctx);
  const calledBy = callers(ctx);
  const on = doorsThrough(ctx);
  // A stamped file is written by people; a hand edit is how it changes.
  // A test reading a place is how it is checked, not what it breaks.
  const places = writtenPlaces(ctx)
    .map((place) => ({ ...place, readers: place.readers.filter((reader) => !reader.fromTests) }))
    .filter((place) => !place.stamped && place.readers.length >= 2)
    .sort((a, b) => b.readers.length - a.readers.length || cmp(a.target, b.target))
    .slice(0, PLACE_BREAKS)
    .map((place) => ({
      kind: 'place',
      target: ctx.place(place.target),
      writers: partsOf(ctx, place.writers),
      readers: partsOf(ctx, place.readers.map((reader) => reader.path)),
    }));
  const parts = ctx.boundaries
    .map((boundary) => ({
      kind: 'part',
      name: boundary.name,
      // The name the list gives the part, so the site's picture of the list
      // calls a root-level part "the repository root" as the list does.
      partLabel: ctx.shown(boundary.name),
      importedBy: [...(from.get(boundary.name) ?? [])].sort(cmp),
      importedByTests: [...(fromTests.get(boundary.name) ?? [])].sort(cmp),
      ...(spawnedBy.has(boundary.name) ? { spawnedBy: [...spawnedBy.get(boundary.name)].sort(cmp) } : {}),
      ...(calledBy.has(boundary.name) ? { calledBy: [...calledBy.get(boundary.name)].sort(cmp) } : {}),
      doors: on.get(boundary.name) ?? 0,
    }))
    .filter((part) => part.importedBy.length > 0 || part.importedByTests.length > 0 || (part.spawnedBy?.length ?? 0) > 0 || (part.calledBy?.length ?? 0) > 0 || part.doors >= 2)
    .sort((a, b) => b.importedBy.length - a.importedBy.length || (b.spawnedBy?.length ?? 0) - (a.spawnedBy?.length ?? 0)
      || (b.calledBy?.length ?? 0) - (a.calledBy?.length ?? 0) || b.doors - a.doors
      || b.importedByTests.length - a.importedByTests.length || cmp(a.name, b.name))
    .slice(0, BREAK_LINES - places.length);
  return [...parts, ...places];
}

/**
 * The imports among the parts "What breaks what" lists, one per ordered pair,
 * so a picture can draw them without reading structure.json. A pair is from
 * tests only when every import between the two is in a test file, the rule
 * the list uses for its test-only count.
 */
function breakEdges(ctx, entries) {
  const listed = new Set(entries.filter((entry) => entry.kind === 'part').map((entry) => entry.name));
  const pairs = new Map();
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from === edge.to || !listed.has(edge.from) || !listed.has(edge.to)) continue;
    const key = JSON.stringify([edge.from, edge.to]);
    const fromTests = Boolean(edge.fromTests) && (pairs.get(key)?.fromTests ?? true);
    pairs.set(key, { from: edge.from, fromTests, to: edge.to });
  }
  return [...pairs.values()].sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to));
}

function breakLine(ctx, entry) {
  if (entry.kind === 'place') {
    const comma = entry.writers.length > 1 ? ',' : '';
    const writers = list(entry.writers.map(ctx.shown));
    return `- **${entry.target}** is written by ${writers}${comma} and read by ${list(entry.readers.map(ctx.shown))}; a hand edit reaches every reader.`;
  }
  const fromTests = entry.importedByTests ?? [];
  const path = entry.doors === 0 ? 'no door' : count(entry.doors, 'door');
  // A part another part runs as a child process, or calls over HTTP, breaks
  // it as an import does.
  const spawned = entry.spawnedBy ?? [];
  const called = entry.calledBy ?? [];
  if (spawned.length > 0 || called.length > 0) {
    const clauses = [];
    if (entry.importedBy.length > 0) clauses.push(`is imported by ${count(entry.importedBy.length, 'part')} (${entry.importedBy.map(ctx.shown).join(', ')})`);
    const tests = testsClause(entry.importedBy.length, fromTests.length);
    if (tests) clauses.push(tests);
    if (spawned.length > 0) clauses.push(`is run as a child process by ${count(spawned.length, 'part')} (${spawned.map(ctx.shown).join(', ')})`);
    if (called.length > 0) clauses.push(`is called over HTTP by ${count(called.length, 'part')} (${called.map(ctx.shown).join(', ')})`);
    const joined = clauses.length > 1 ? `${clauses.join(', ')},` : clauses[0];
    return `- **${ctx.shown(entry.name)}** ${joined} and sits on the path of ${path}.`;
  }
  if (entry.importedBy.length === 0 && fromTests.length > 0) {
    return `- **${ctx.shown(entry.name)}** is imported only from tests, by ${count(fromTests.length, 'part')} (${fromTests.map(ctx.shown).join(', ')}), and sits on the path of ${path}.`;
  }
  const imported = entry.importedBy.length === 0
    ? 'is imported by no other part'
    : `is imported by ${count(entry.importedBy.length, 'part')} (${entry.importedBy.map(ctx.shown).join(', ')})`;
  const tests = testsClause(entry.importedBy.length, fromTests.length);
  if (tests) return `- **${ctx.shown(entry.name)}** ${imported}, ${tests}; it sits on the path of ${path}.`;
  return `- **${ctx.shown(entry.name)}** ${imported} and sits on the path of ${path}.`;
}

/**
 * The parts that import a part only from test files, as a clause after a
 * production count that is not zero: "and by 3 more only from tests".
 *
 * @param {number} production
 * @param {number} tests
 * @returns {string|null}
 */
export function testsClause(production, tests) {
  return production === 0 || tests === 0 ? null : `and by ${tests} more only from tests`;
}

function breaksSection(ctx, entries) {
  const body = entries.length > 0
    ? entries.map((entry) => breakLine(ctx, entry)).join('\n')
    : absence('breaks', unreadCount(ctx));
  return ['## What breaks what', body].join('\n\n');
}

function importsBetween(ctx) {
  const edges = new Set();
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from !== edge.to) edges.add(`${edge.from}\0${edge.to}`);
  }
  return (from, to) => edges.has(`${from}\0${to}`);
}

// Whether one part calls another over HTTP (core/http.js).
function callsBetween(ctx) {
  const edges = new Set((ctx.structure.edges ?? []).filter((edge) => edge.kind === 'http' && edge.from !== edge.to).map((edge) => `${edge.from}\0${edge.to}`));
  return (from, to) => edges.has(`${from}\0${to}`);
}

function relationOf(imports, partA, partB, calls = () => false) {
  if (partA == null || partB == null) return 'unassigned';
  if (partA === partB) return 'inside';
  const ab = imports(partA, partB);
  const ba = imports(partB, partA);
  if (ab && ba) return 'both';
  if (ab) return 'a-imports-b';
  if (ba) return 'b-imports-a';
  // Two parts no import joins may still be one change: a UI and the server
  // it calls.
  if (calls(partA, partB)) return 'a-calls-b';
  if (calls(partB, partA)) return 'b-calls-a';
  return 'none';
}

// The coupling population is source files only, the same rule the statistics
// use for cohesion: two docs edited in one commit say nothing about code. A
// file and its own test changing together is expected and tells a reader
// nothing, so those pairs are counted and kept out of the ranking.
function together(ctx) {
  const imports = importsBetween(ctx);
  const calls = callsBetween(ctx);
  const source = (ctx.statistics.pairs ?? []).filter((pair) => isSourcePath(pair.a) && isSourcePath(pair.b));
  const pairs = source
    .filter((pair) => !ownTestPair(pair.a, pair.b))
    .sort((x, y) => y.strength - x.strength || y.shared - x.shared || cmp(x.a, y.a) || cmp(x.b, y.b))
    .slice(0, PAIRS_SHOWN)
    .map((pair) => {
      const parts = [ctx.boundaryOf.get(pair.a) ?? null, ctx.boundaryOf.get(pair.b) ?? null];
      const partLabels = parts.map((part) => label(ctx, part));
      return { a: pair.a, b: pair.b, either: pair.either, partLabels, parts, relation: relationOf(imports, parts[0], parts[1], calls), shared: pair.shared };
    });
  return { pairs, withTests: source.filter((pair) => ownTestPair(pair.a, pair.b)).length };
}

// A part's name is often a common word ("tests imports backpropagate"), so a
// sentence about parts says "the tests part". The repository root is already
// a phrase.
function partPhrase(partLabel) {
  return partLabel === ROOT_NAME || partLabel === SITE_NAME ? partLabel : `the ${partLabel} part`;
}

function relationClause(pair) {
  const [a, b] = pair.partLabels.map(partPhrase);
  switch (pair.relation) {
    case 'inside': return `, inside ${a}.`;
    case 'a-imports-b': return `, and ${a} imports ${b}.`;
    case 'b-imports-a': return `, and ${b} imports ${a}.`;
    case 'both': return `, and ${a} and ${b} import each other.`;
    case 'a-calls-b': return `, and ${a} calls ${b} over HTTP.`;
    case 'b-calls-a': return `, and ${b} calls ${a} over HTTP.`;
    case 'none': return ', though neither part imports the other.';
    default: return '.';
  }
}

function windowLine(parameters) {
  const span = typeof parameters?.windowDays === 'number'
    ? `${count(parameters.windowDays, 'day')}`
    : (parameters?.pinnedStart ? `since ${parameters.pinnedStart}` : null);
  const floor = typeof parameters?.sharedFloorUsed === 'number'
    ? `a pair counts from ${count(parameters.sharedFloorUsed, 'shared commit')}${floorRule(parameters)}`
    : null;
  const parts = [span, floor].filter(Boolean);
  return parts.length > 0 ? `Window: ${parts.join('; ')}.` : null;
}

// Why the floor is where it is, and what would move it, so a list that
// appears or empties between two maps says which count crossed which line.
// Statistics written before the rise threshold existed say only the floor.
function floorRule(parameters) {
  const files = parameters.sourceFilesReachingStrongFloor;
  const { fallenShared, qualifyingMinimum, shared, sourceFileReach, sourceFileRise } = parameters;
  if (![files, fallenShared, qualifyingMinimum, shared, sourceFileReach, sourceFileRise].every((value) => typeof value === 'number')) return '';
  if (parameters.floorTrigger === 'thin-history' || parameters.floorTrigger === 'both') {
    return `, since the window holds fewer than ${count(qualifyingMinimum, 'qualifying commit')}`;
  }
  const reached = `${count(files, 'source file')} ${files === 1 ? 'reaches' : 'reach'} ${shared} revisions`;
  if (parameters.floor === 'strong') return `, since ${reached}; the floor falls to ${fallenShared} when fewer than ${sourceFileReach} do`;
  if (parameters.floorHeld) return `, since ${reached} and the floor had fallen; it rises back to ${shared} when ${sourceFileRise} do`;
  return `, since ${reached}; the floor rises to ${shared} when ${sourceFileRise} do`;
}

function togetherNote(ctx, pairs, withTests) {
  const lines = [];
  if (withTests > 0) lines.push(`${count(withTests, 'file')} changed together with ${withTests === 1 ? 'its' : 'their'} own ${withTests === 1 ? 'test' : 'tests'}, as expected.`);
  const confidence = ctx.statistics.confidence;
  if (pairs.length > 0 && confidence?.level === 'low') {
    const reason = String(confidence.reason ?? '').trim().replace(/\.$/, '');
    lines.push(reason ? `Confidence is low: ${reason}.` : 'Confidence is low.');
  }
  const window = windowLine(ctx.statistics.parameters);
  if (window) lines.push(window);
  return lines;
}

function togetherSection(ctx, pairs, withTests, note) {
  const none = withTests > 0
    ? 'No two source files, other than a file and its own test, changed together often enough to name.'
    : 'No two source files changed together often enough to name.';
  const body = pairs.length > 0
    ? pairs.map((pair) => `- **${pair.a}** and **${pair.b}** changed together in ${pair.shared} of ${count(pair.either, 'commit')}${relationClause(pair)}`).join('\n')
    : none;
  return ['## What tends to change together', body, ...note].join('\n\n');
}

function more(total, shown, noun) {
  return total > shown ? [`And ${total - shown} more ${total - shown === 1 ? noun : `${noun}s`}.`] : [];
}

// A code part with no source of its own outside test material (a fixtures
// directory, say) has nothing a test would import, so it is not a candidate.
function untested(ctx) {
  const testFiles = ctx.structure.testFiles ?? 0;
  const parts = ctx.boundaries.filter((boundary) => boundary.role === 'code'
    && (boundary.files ?? []).some((file) => isSourcePath(file.path) && !isTestMaterial(file.path)));
  const testedBy = Object.fromEntries(parts.map((boundary) => [boundary.name, boundary.testedBy ?? 0]));
  if (testFiles === 0) return { items: [], note: ['No test files were found by name.'], testedBy, testFiles, spawned: [] };
  const all = parts.filter((boundary) => (boundary.testedBy ?? 0) === 0)
    .map((boundary) => ({ part: boundary.name, partLabel: ctx.shown(boundary.name), testedBy: 0 }));
  // A part a test runs as a child process and none imports is touched, but
  // only by running it, so the page says how.
  const spawned = parts.filter((boundary) => boundary.testedThroughSpawn && (boundary.testedBy ?? 0) > 0).map((boundary) => boundary.name);
  const through = spawned.map((name) => spawnedLine(ctx.shown(name)));
  return { items: all.slice(0, UNTESTED_SHOWN), note: [...through, ...more(all.length, UNTESTED_SHOWN, 'part')], testedBy, testFiles, spawned };
}

/**
 * What the page says of a part tests touch only by running its files.
 *
 * @param {string} partLabel
 * @returns {string}
 */
export function spawnedLine(partLabel) {
  return `${partLabel} is touched by tests only through a spawn: a test runs its files as a child process.`;
}

function untestedSection(found) {
  const every = found.spawned.length > 0 ? 'Every code part is touched by at least one test.' : 'Every code part is imported by at least one test.';
  const body = found.items.length > 0
    ? found.items.map((item) => `- **${item.partLabel}** is imported by no test.`).join('\n')
    : (found.testFiles === 0 ? null : every);
  return ['## What no test touches', ...(body ? [body] : []), ...found.note].join('\n\n');
}

// A place is unread when nothing but its own writers reads it: a writer that
// reads back what it wrote is making the result, not using it.
function unread(ctx) {
  const written = writtenPlaces(ctx);
  const all = written
    .filter((place) => !place.stamped && place.readers.every((reader) => place.writers.includes(reader.path) && !place.once.includes(reader.path)))
    .map((place) => ({
      place: ctx.place(place.target),
      writers: writerItems(ctx, place.writers, place.guards),
    }));
  return { items: all.slice(0, UNREAD_SHOWN), note: more(all.length, UNREAD_SHOWN, 'place'), written: written.length };
}

// With nothing written, "every written place has a reader" would be true of
// nothing; the page says there is nothing to read instead.
function unreadSection(ctx, found) {
  const body = found.items.length > 0
    ? found.items.map((item) => {
      const comma = item.writers.length > 1 ? ',' : '';
      return `- **${item.place}** is written by ${list(worded(item.writers, ctx.shown))}${comma} and read by nothing else in this repository.`;
    }).join('\n')
    : (found.written === 0 ? absence('unread', unreadCount(ctx)) : 'Every written place has a reader.');
  return ['## Written but never read', body, ...found.note].join('\n\n');
}

function baseName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function sameCalls(a, b) {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/**
 * Exported functions of one name in two parts that look like one helper
 * written twice. Where the map recorded the order of work for both, the calls
 * must match name for name in order; where either has none, the files must
 * share a name. Test material is left out: a fixture's helper is not the
 * repository's. Pairs are grouped by name; a name alike in three or more
 * parts is one candidate, read as a contract.
 */
function duplicates(ctx) {
  const byName = new Map();
  for (const boundary of ctx.boundaries) {
    for (const file of boundary.files ?? []) {
      if (isTestMaterial(file.path)) continue;
      for (const name of file.exports ?? []) {
        const sequence = (file.sequences ?? []).find((item) => item.name === name);
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ path: file.path, part: boundary.name, calls: sequence ? sequence.calls.map((call) => call.name) : null });
      }
    }
  }
  const all = [];
  for (const name of [...byName.keys()].sort(cmp)) {
    const owners = byName.get(name).sort((a, b) => cmp(a.path, b.path));
    const pairs = [];
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        const [a, b] = [owners[i], owners[j]];
        if (a.part === b.part || ownTestPair(a.path, b.path)) continue;
        const alike = a.calls && b.calls ? sameCalls(a.calls, b.calls) : baseName(a.path) === baseName(b.path);
        if (!alike) continue;
        pairs.push({ files: [a.path, b.path], name, partLabels: [ctx.shown(a.part), ctx.shown(b.part)], parts: [a.part, b.part] });
      }
    }
    const parts = [...new Set(pairs.flatMap((pair) => pair.parts))].sort(cmp);
    if (parts.length >= CONTRACT_PARTS) {
      const files = [...new Set(pairs.flatMap((pair) => pair.files))].sort(cmp);
      all.push({ contract: true, files, name, partLabels: parts.map(ctx.shown), parts });
    } else {
      all.push(...pairs);
    }
  }
  const items = all.slice(0, DUPLICATES_SHOWN);
  const rest = all.slice(DUPLICATES_SHOWN);
  return {
    items,
    lead: items.length > 0 ? 'These are candidates from names and call order, not a judgement.' : null,
    note: more(all.length, DUPLICATES_SHOWN, rest.every((item) => !item.contract) ? 'pair' : 'candidate'),
  };
}

// One name exported alike by three or more parts is one line: that many
// copies of one helper is less likely than one contract each part fulfils.
export function contractLine(name, partLabels) {
  const shown = partLabels.length > CONTRACT_NAMED
    ? `${partLabels.slice(0, CONTRACT_NAMED).join(', ')} and ${partLabels.length - CONTRACT_NAMED} more`
    : list(partLabels);
  return `**${name}** is exported by ${count(partLabels.length, 'part')} (${shown}); with the same name in this many parts it is most likely a shared contract, not a copy.`;
}

function duplicatesSection(found) {
  const body = found.items.length > 0
    ? found.items.map((item) => (item.contract
      ? `- ${contractLine(item.name, item.partLabels)}`
      : `- **${item.name}** is exported by ${item.files[0]} (${item.partLabels[0]}) and ${item.files[1]} (${item.partLabels[1]}); the two look alike.`)).join('\n')
    : absence('duplicates', found.unread ?? 0);
  return ['## Helpers that look duplicated', ...(found.lead ? [found.lead] : []), body, ...found.note].join('\n\n');
}

// A written place people make most of the commits to (the statistics decide
// which, adapter/statistics.js authorshipOf) is theirs, which a workflow also
// writes; statistics written before authorship was counted list none, and
// every written place reads as generated.
function peopleCommits(ctx, target) {
  return (ctx.statistics.authorship?.places ?? []).find((item) => item.target === target) ?? null;
}

// A part one bot added every file of, by the bot's name.
function botAdded(ctx, name) {
  return (ctx.statistics.authorship?.parts ?? []).find((item) => item.name === name)?.addedBy ?? null;
}

function generated(ctx) {
  const items = [];
  const claimed = [];
  const written = writtenPlaces(ctx).filter((place) => !peopleCommits(ctx, place.target));
  for (const boundary of ctx.boundaries.filter((item) => item.origin === 'generated' && !peopleCommits(ctx, boundaryRoot(item) ?? ''))) {
    const root = boundaryRoot(boundary);
    const paths = (boundary.files ?? []).map((file) => file.path);
    const inside = (target) => (root ? under(target, root) : paths.some((path) => under(path, target)));
    const held = written.filter((place) => inside(place.target));
    const writers = [...new Set(held.flatMap((place) => place.writers))].sort(cmp);
    const guards = new Map();
    for (const place of held) {
      for (const [by, list] of place.guards) guards.set(by, guards.has(by) ? guards.get(by).filter((guard) => list.includes(guard)) : list);
    }
    claimed.push(inside);
    const once = writers.length > 0 && writers.every((by) => (guards.get(by) ?? []).includes('exists'));
    items.push({ place: boundaryPlace(boundary), shown: shownPlace(ctx, boundary), writers, guards, ...(once ? { once: true } : {}) });
  }
  for (const place of written) {
    if (claimed.some((inside) => inside(place.target))) continue;
    const target = ctx.place(place.target);
    const once = place.writers.length > 0 && place.writers.every((by) => (place.guards.get(by) ?? []).includes('exists'));
    items.push({ place: target, shown: target, writers: place.writers, guards: place.guards, ...(place.stamped ? { block: true } : {}), ...(once ? { once: true } : {}) });
  }
  for (const boundary of ctx.boundaries.filter((item) => item.origin !== 'generated')) {
    const bot = botAdded(ctx, boundary.name);
    if (bot) items.push({ place: boundaryPlace(boundary), shown: shownPlace(ctx, boundary), writers: [], guards: new Map(), addedBy: bot });
  }
  return items
    .sort((a, b) => cmp(a.place, b.place))
    .map(({ guards, ...item }) => ({ ...item, writers: writerItems(ctx, item.writers, guards) }));
}

function generatedSection(ctx, items) {
  const body = items.length > 0
    ? items.map((item) => {
      if (item.addedBy) return `- **${item.shown}** is written by ${item.addedBy}, which added every file in it.`;
      if (item.writers.length === 0) return `- **${item.shown}** is written by code this map cannot name.`;
      const by = list(worded(item.writers, ctx.shown));
      if (item.once) return `- **${item.shown}** is written once by ${by}.`;
      return item.block ? `- **${item.shown}** has a block written by ${by}.` : `- **${item.shown}** is written by ${by}.`;
    }).join('\n')
    : absence('generated', unreadCount(ctx));
  return ['## Generated, never hand-edited', body].join('\n\n');
}

function authored(ctx) {
  return ctx.boundaries
    .filter((boundary) => boundary.origin === 'authored' && ['config', 'data', 'docs', 'site'].includes(boundary.role))
    .filter((boundary) => !botAdded(ctx, boundary.name))
    .sort((a, b) => cmp(boundaryPlace(a), boundaryPlace(b)));
}

// The written places people make most of the commits to, each with its
// writers and the count that says so.
function writtenByPeople(ctx) {
  return writtenPlaces(ctx)
    .map((place) => ({ place, people: peopleCommits(ctx, place.target) }))
    .filter((item) => item.people)
    .map(({ place, people }) => ({
      byPeople: people.byPeople,
      commits: people.commits,
      place: ctx.place(place.target),
      writers: writerItems(ctx, place.writers, place.guards),
    }));
}

// Nothing the map names writes to these parts, but a write whose path is
// built at run time could land anywhere, so the page says so rather than
// that nothing writes to them.
function unnamedWrites(ctx) {
  return ctx.boundaries.reduce((sum, boundary) => sum + (boundary.dynamicWrites ?? 0), 0);
}

function authoredSection(ctx, boundaries, shared) {
  const unnamed = unnamedWrites(ctx);
  const people = `People write ${list(boundaries.map((boundary) => shownPlace(ctx, boundary)))}`;
  const caveat = unnamed > 0
    ? `${people}; ${count(unnamed, 'write')} with ${unnamed === 1 ? 'a path' : 'paths'} built at run time may land here.`
    : absence('authored', unreadCount(ctx), people);
  const body = boundaries.length > 0 ? caveat : 'No configuration or documentation part is left to people alone.';
  const lines = shared.map((item) => `- **${item.place}** is written by ${list(worded(item.writers, ctx.shown))}, and by people: ${item.byPeople} of its ${count(item.commits, 'commit')} in the window ${item.byPeople === 1 ? 'is' : 'are'} theirs.`);
  return ['## Hand-authored', body, ...(lines.length > 0 ? [lines.join('\n')] : [])].join('\n\n');
}

function entryFile(boundary) {
  const points = [...(boundary?.entryPoints ?? [])].sort(cmp);
  const index = points.find((path) => /^index\./.test(path.slice(path.lastIndexOf('/') + 1)));
  return index ?? points[0] ?? null;
}

function isIndex(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base === '__init__.py' || /^index\.[cm]?[jt]sx?$/.test(base);
}

// The file a file's entry first calls into inside a part, when the map
// recorded its order of work.
function firstCallInto(ctx, path, part) {
  const file = ctx.fileOf.get(path);
  const root = (file?.sequences ?? []).find((sequence) => sequence.name === file.entry);
  const call = (root?.calls ?? []).find((item) => !item.passed && item.target?.file && ctx.boundaryOf.get(item.target.file) === part);
  return call?.target.file ?? null;
}

// A page a reader opens runs as surely as a script does.
function runsAsCode(path) {
  return isCodePath(path) || /\.html?$/i.test(path);
}

function pullRequested(door) {
  return (door.triggers ?? []).some((trigger) => trigger.event === 'pull_request' || trigger.event === 'pull_request_target');
}

// A door only a push or the clock starts acts on a change after review.
function afterReview(door) {
  const events = (door.triggers ?? []).map((trigger) => trigger.event).filter((event) => event !== 'workflow_dispatch');
  return events.length > 0 && events.every((event) => event === 'push' || event === 'schedule');
}

/**
 * The door "Where to start" follows. A change a person makes enters through
 * the pull request first, so when the busiest door is not one a pull request
 * starts (a push, a schedule, a tag, a release, a command people run), the
 * widest door a pull request starts is followed instead. A door another
 * repository starts with a dispatch is the way that repository's work comes
 * in, and stays.
 */
function startDoor(ctx, main) {
  if (!main || pullRequested(main) || dispatched(main)) return main;
  return reaching(ctx.doors).find((door) => !installed(door) && pullRequested(door)) ?? main;
}

function dispatched(door) {
  return (door.triggers ?? []).some((trigger) => trigger.event === 'repository_dispatch');
}

// The runs a pull request reaches: a job held to another trigger, or to what
// an earlier job's output says (a path filter's needs.changes), is left out,
// unless every run is in one.
function startRuns(door) {
  const gated = new Set([...(door.gated ?? []).flatMap((entry) => entry.jobs ?? []), ...(door.conditional ?? [])]);
  const runs = (door.runs ?? []).filter((run) => !gated.has(run.job));
  return runs.length > 0 ? runs : door.runs ?? [];
}

/**
 * The file a directory run is followed from: the file in it that imports
 * into the next part the walk reaches, else the part's entry point inside it,
 * else its first code file.
 */
// The parts a set of files reaches through the imports the map recorded.
function partsReached(ctx, files) {
  const seen = new Set();
  const parts = new Set();
  const stack = [...files];
  while (stack.length > 0) {
    const path = stack.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const part = ctx.boundaryOf.get(path);
    if (part) parts.add(part);
    for (const target of ctx.fileOf.get(path)?.importsFiles ?? []) {
      // A build chunk whose sources share a part is imported as @part.
      if (target.startsWith('@')) parts.add(target.slice(1));
      else if (!seen.has(target)) stack.push(target);
    }
  }
  return parts;
}

// The files a set of runs stands for: each file, and every file under each
// directory.
function filesOfRuns(ctx, paths) {
  const out = [];
  for (const path of paths) {
    if (!path.endsWith('/')) out.push(path);
    else for (const file of ctx.fileOf.keys()) if (file.startsWith(path)) out.push(file);
  }
  return out;
}

function fileInRun(ctx, door, dir) {
  const next = deeper(door)[0]?.entries.map((entry) => entry.enters?.from).filter((path) => path?.startsWith(dir)) ?? [];
  if (next.length > 0) return [...next].sort(cmp)[0];
  const entry = entryFile(ctx.boundaries.find((boundary) => boundary.name === runPart(ctx, dir)));
  if (entry?.startsWith(dir) && !ctx.fileOf.get(entry)?.noStatements) return entry;
  return [...ctx.fileOf.keys()].filter((path) => path.startsWith(dir) && isCodePath(path) && !ctx.fileOf.get(path)?.noStatements).sort(cmp)[0] ?? null;
}

// A chain names this many files after the door at most, so it stays a path
// a person reads in one sitting.
const START_STEPS = 6;

/**
 * The files to read to follow one pass through the door, each joined to the
 * one before by an edge the map recorded: the door runs the first, a file
 * imports the next, a file writes the place, and the code that reads that
 * place ends it. The chain starts at a file the door runs (see startRuns for
 * which jobs), past any file with no statements (an empty __init__.py). From
 * each file it goes to the file it imports that writes a place the door lands
 * on and code outside reads, and otherwise into another part, the one the
 * door reaches most files of; a test is passed over for the production file
 * it imports, and a package index to the file the entry's call reaches
 * through it. It ends at the place a file writes and the first reader
 * outside the door's own reach, so it ends at whoever uses the result rather
 * than whoever makes it.
 */
function startHere(ctx, main) {
  const chain = installed(main) ? [] : [main.file];
  const add = (path) => {
    if (path != null && !chain.includes(path)) chain.push(path);
  };
  const depthZero = (main.reach ?? []).filter((entry) => entry.depth === 0);
  // The path starts at a file the door runs; a file it only lints is read,
  // not followed, so it starts there only when nothing is run. Of the files
  // it runs, one its commands name comes before one a tool's conventions
  // matched: a gate script says more about the door than its hundredth test.
  const runs = startRuns(main);
  const named = new Set(runs.filter((run) => !run.matched).map((run) => run.path));
  const executed = new Set(runs.filter((run) => run.runKind !== 'checks').map((run) => run.path));
  const ran = shownRuns(main, 'executes').filter((path) => executed.has(path));
  const spelled = ran.filter((path) => named.has(path));
  const paths = (spelled.length > 0 ? spelled : ran).filter((path) => path.endsWith('/') || runsAsCode(path));
  const filesIn = (path) => depthZero.find((entry) => entry.boundary === runPart(ctx, path))?.files ?? 0;
  const readable = (path) => runsAsCode(path) && !ctx.fileOf.get(path)?.noStatements;
  const entries = new Set(ctx.boundaries.flatMap((boundary) => boundary.entryPoints ?? []));
  const byWidth = (a, b) => Number(a !== main.entry) - Number(b !== main.entry) || filesIn(b) - filesIn(a) || cmp(a, b);
  // The path begins at the door's entry: a file it runs that is its part's
  // entry point (a bin, a main, a src/index), else a script its commands
  // name that goes on into the code (python scripts/smoke.py importing the
  // package), else the entry of a part it reaches, one a file it runs imports
  // first and then the part it reaches most files of. A helper its commands
  // name that imports nothing (a coverage gate) comes after all of those, and
  // a test is passed over for the production file it imports. Every arrow is
  // an edge the map recorded: a run, an import, the door's reach into a
  // part. A package is read from what an import of its name loads.
  // A barrel is passed through to the file it hands on, and a file holding
  // one constant is never where a reader starts.
  const firstOf = (path) => {
    const file = path.endsWith('/') ? fileInRun(ctx, main, path) : path;
    if (file == null) return null;
    if (!isTestFile(file)) return readable(file) ? working(ctx, file, null) : null;
    for (const target of ctx.fileOf.get(file)?.importsFiles ?? []) {
      if (!ctx.fileOf.has(target) || !readable(target) || isTestFile(target)) continue;
      const found = working(ctx, target, null);
      if (found != null) return found;
    }
    return null;
  };
  const imported = new Set(filesOfRuns(ctx, ran).flatMap((path) => ctx.fileOf.get(path)?.importsFiles ?? []));
  // Only the parts the production files it runs reach by import: a part a
  // linter only reads is read, not followed, and a part a test reaches is
  // reached through the test (firstOf), never as the door's own entry.
  const executedParts = partsReached(ctx, filesOfRuns(ctx, ran).filter((path) => !isTestFile(path)));
  const partEntries = (main.reach ?? [])
    .filter((entry) => executedParts.has(entry.boundary))
    .map((entry) => entryFile(ctx.boundaries.find((boundary) => boundary.name === entry.boundary)))
    .filter((path) => path != null && readable(path) && !isTestFile(path));
  const drives = (path) => !path.endsWith('/') && !isTestFile(path) && (ctx.fileOf.get(path)?.importsFiles ?? []).length > 0;
  const helper = (path) => !path.endsWith('/') && !isTestFile(path) && (ctx.fileOf.get(path)?.importsFiles ?? []).length === 0;
  const candidates = [
    ...ran.filter((path) => entries.has(path) && !isTestFile(path)).sort(byWidth),
    ...spelled.filter(drives).sort(byWidth),
    ...[...new Set(partEntries)].sort((a, b) => Number(!imported.has(a)) - Number(!imported.has(b)) || byWidth(a, b)),
    // A helper that imports nothing comes after a test's way into the code.
    ...[...paths].sort((a, b) => Number(helper(a)) - Number(helper(b)) || byWidth(a, b)),
  ];
  let current = null;
  for (const path of candidates) {
    const file = firstOf(path);
    if (file != null) {
      current = file;
      break;
    }
  }
  if (current == null) return { chain: [], words: [] };
  add(current);
  const reached = new Set((main.reach ?? []).map((entry) => entry.boundary));
  const breadth = new Map((main.reach ?? []).map((entry) => [entry.boundary, entry.files]));
  const lands = main.landings ?? [];
  // The place a file writes that the door lands on, with the code outside the
  // chain that reads it, the reader outside the door's reach first.
  const ending = (path) => {
    for (const landing of ctx.landings) {
      if (!landing.writers.some((entry) => entry.by === path)) continue;
      if (!lands.some((target) => under(landing.target, target) || under(target, landing.target))) continue;
      const readers = ctx.landings
        .filter((other) => under(other.target, landing.target) || under(landing.target, other.target))
        .flatMap((other) => other.readers)
        .filter((entry) => entry.by !== path && !chain.includes(entry.by) && runsAsCode(entry.by) && !entry.fromTests && !quotedOnly(entry))
        .sort((a, b) => Number(reached.has(ctx.boundaryOf.get(a.by))) - Number(reached.has(ctx.boundaryOf.get(b.by)))
          || Number(a.confidence === 'text') - Number(b.confidence === 'text') || cmp(a.by, b.by));
      if (readers.length > 0) return { place: ctx.place(landing.target), reader: readers[0].by };
    }
    return null;
  };
  const next = (path) => {
    const part = ctx.boundaryOf.get(path) ?? null;
    const options = (ctx.fileOf.get(path)?.importsFiles ?? [])
      .filter((target) => ctx.fileOf.has(target) && readable(target) && !chain.includes(target) && !isTestFile(target) && !ctx.fileOf.get(target)?.constantOnly);
    const writer = options.find((target) => ending(target));
    if (writer) return writer;
    const width = (target) => breadth.get(ctx.boundaryOf.get(target)) ?? 0;
    return options.filter((target) => (ctx.boundaryOf.get(target) ?? null) !== part).sort((a, b) => width(b) - width(a) || cmp(a, b))[0] ?? null;
  };
  for (let step = 0; step < START_STEPS; step += 1) {
    const end = ending(current);
    if (end) {
      add(end.place);
      add(end.reader);
      break;
    }
    let following = next(current);
    if (following == null) break;
    if (ctx.fileOf.get(following)?.reexportsOnly) {
      following = working(ctx, following, current);
      if (following == null || chain.includes(following)) break;
    }
    add(following);
    if (isIndex(following)) {
      // A package index that only hands a name on is followed to the file the
      // entry's call reaches through it, since that is where the work is.
      const through = firstCallInto(ctx, current, ctx.boundaryOf.get(following));
      if (through && (ctx.fileOf.get(following)?.importsFiles ?? []).includes(through) && readable(through) && !chain.includes(through)) {
        add(through);
        following = through;
      }
    }
    current = following;
  }
  return { chain, words: [...chain] };
}

// A barrel is followed through as many hops as a package's index usually
// takes to reach the file that holds the code.
const BARREL_HOPS = 4;

/**
 * The file a reader goes on to from a file the chain reaches: the file
 * itself when it does work; for a barrel, whose every statement hands on what
 * another file exports, the file it hands on that the call from `from`
 * reaches, else the first one it hands on that does work; and nothing for a
 * file that holds one constant, which is never where a reader starts or
 * stops.
 */
function working(ctx, path, from, hops = 0) {
  const file = ctx.fileOf.get(path);
  if (file?.constantOnly) return null;
  if (!file?.reexportsOnly) return path;
  if (hops >= BARREL_HOPS) return null;
  const handed = (file.importsFiles ?? []).filter((target) => ctx.fileOf.has(target) && !isTestFile(target));
  const called = from == null ? null : firstCallInto(ctx, from, ctx.boundaryOf.get(path));
  const ordered = called != null && handed.includes(called) ? [called, ...handed.filter((target) => target !== called)] : handed;
  for (const target of ordered) {
    const found = working(ctx, target, from, hops + 1);
    if (found != null && found !== path) return found;
  }
  return null;
}

// A door that only checks code, or whose production runs all go nowhere (a
// gate script that imports nothing beside a suite of tests), runs none of the
// code as a person uses it: its one way into the code is a test's import, or
// none at all. Null when it runs code of its own; otherwise what it runs,
// which the page says.
function testsOnly(ctx, door) {
  if (!door || installed(door)) return null;
  const executed = new Set(startRuns(door).filter((run) => run.runKind !== 'checks').map((run) => run.path));
  const files = filesOfRuns(ctx, shownRuns(door, 'executes').filter((path) => executed.has(path))).filter(runsAsCode);
  if (files.length === 0) return (door.runs ?? []).length > 0 ? { checks: true } : null;
  if (!files.some(isTestFile)) return null;
  const helpers = files.filter((path) => !isTestFile(path));
  if (helpers.some((path) => (ctx.fileOf.get(path)?.importsFiles ?? []).length > 0)) return null;
  return { helpers: helpers.length > 0 };
}

/**
 * The installed doors "Where to start" may follow when the pull request's
 * door runs only tests, in the order it tries them: each command the
 * manifest installs, one whose file goes on into the code before a launcher
 * that imports nothing here, the one named for the package first, then the
 * widest; then the package's own entry.
 */
function installedStart(ctx) {
  const pkg = ctx.doors.find((door) => door.kind === 'package' && !door.parseError) ?? null;
  const own = pkg ? String(pkg.name).replace(/^@[^/]+\//, '') : null;
  const launcher = (door) => !(door.runs ?? []).some((run) => (ctx.fileOf.get(run.path)?.importsFiles ?? []).length > 0);
  const commands = ctx.doors.filter((door) => door.kind === 'command' && !door.parseError && (door.runs ?? []).length > 0)
    .sort((a, b) => Number(launcher(a)) - Number(launcher(b)) || Number(a.name !== own) - Number(b.name !== own) || reachSize(b) - reachSize(a) || cmp(a.name, b.name));
  return [...commands, ...(pkg && (pkg.runs ?? []).length > 0 ? [pkg] : [])];
}

// Why the path follows an installed door rather than the pull request's. The
// door's name is not put first, since it may be spelled in lower case.
function startReason(from, door, found) {
  const runs = found.checks ? 'only checks code' : found.helpers ? 'runs only tests and scripts that import no code here' : 'runs only tests';
  return `This path follows ${door.name} (${installedAs(door)}) from its entry, since ${from.name} ${runs}.`;
}

// What "Where to start" says of a door that runs no code the map can follow.
function noPath(door) {
  const checks = shownRuns(door, 'checks').some((path) => path.endsWith('/') || isCodePath(path));
  const why = checks ? `${door.name} runs no code this map can follow; it only checks code` : `${door.name} runs no code this map can follow`;
  return `${why}, so there is no path of files to read in order.`;
}

function startSection(words, main, readable, reason = null) {
  if (!main) {
    const why = readable ? 'No door runs a file this map can see' : 'No door was found';
    return ['## Where to start', `${why}, so there is no path through this repository to follow.`].join('\n\n');
  }
  if (words.length === 0) return ['## Where to start', noPath(main)].join('\n\n');
  const read = `Read those in order to follow one ${triggerNoun(main)} end to end.`;
  return ['## Where to start', words.join(' → '), reason ? `${read} ${reason}` : read].join('\n\n');
}

/**
 * The import sites read as a declared dependency although a local module
 * shares the name, worded with the names. A dependency is not in the
 * repository, so the map follows none of them; saying so apart from what could
 * not be resolved at all keeps the second count the one worth reading.
 */
export function externalsLine(sites, names) {
  if (sites === 0) return null;
  const shown = names.length > 0 ? ` (${list(names)})` : '';
  return names.length > 1
    ? `${count(sites, 'import site')} name declared dependencies that share their names with local modules${shown}; they are read as the dependencies, which are not in this repository.`
    : `${count(sites, 'import site')} ${sites === 1 ? 'names' : 'name'} a declared dependency that shares its name with a local module${shown}; ${sites === 1 ? 'it is' : 'they are'} read as the dependency, which is not in this repository.`;
}

// The constructs the core names when a file stops the parser (core/index.js).
// A line names this many of the files the parser could not read, the rest
// counted, so a reader can open the one that stopped it.
const UNREAD_NAMED = 3;
const UNREAD_SYNTAX = {
  'jsx-ampersand': 'a bare `&` in JSX text',
  'import-type-array': 'an import type followed by `[]`',
  'nul-character': 'a NUL character inside a string',
  'typeof-import-argument': '`typeof import(…)` as a type argument',
};

// How many files stopped on each construct, most first, the unnamed last.
function syntaxCounts(files) {
  const counts = new Map();
  for (const file of files) {
    const key = Object.hasOwn(UNREAD_SYNTAX, file.unreadSyntax ?? '') ? file.unreadSyntax : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const named = [...counts.entries()].filter(([key]) => key != null).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));
  return { named, other: counts.get(null) ?? 0 };
}

// "a NUL character inside a string (2) and other syntax (1)", or null when
// no file stopped on a construct the page can name.
function constructList(files) {
  const { named, other } = syntaxCounts(files);
  if (named.length === 0) return null;
  const items = named.map(([key, n]) => `${UNREAD_SYNTAX[key]} (${n})`);
  if (other > 0) items.push(`other syntax (${other})`);
  return list(items);
}

// One part's share: "5 in fixtures", with the construct when the files there
// all stopped on the same named one, and each named one's count otherwise.
function unreadGroup(group) {
  const { named, other } = syntaxCounts(group.files);
  const lead = `${group.files.length} in ${group.label}`;
  if (named.length === 0) return lead;
  if (named.length === 1 && other === 0) return `${lead} (${UNREAD_SYNTAX[named[0][0]]})`;
  const items = named.map(([key, n]) => `${UNREAD_SYNTAX[key]} in ${n}`);
  if (other > 0) items.push(`other syntax in ${other}`);
  return `${lead} (${list(items)})`;
}

/**
 * The files the parser could not read, with the constructs they stopped on,
 * most files first. What such a file imports is not known, so the count is
 * stated rather than left for a reader to infer from a missing edge. Where a
 * part holds more than one such file the count is given by part, since five
 * fixtures broken on purpose and one schema the parser trips on are not the
 * same finding; with every file in one part, that part is named once. Up to
 * three files are named by path, the rest counted.
 *
 * @param {Array<{ path?: string, unreadSyntax?: string, part?: string|null, partLabel?: string|null }>} files
 * @returns {string|null}
 */
export function unreadLine(files) {
  if (files.length === 0) return null;
  const paths = files.map((file) => file.path).filter((path) => typeof path === 'string' && path !== '').sort(cmp);
  const named = paths.length === 0 ? '' : paths.length > UNREAD_NAMED
    ? ` (${paths.slice(0, UNREAD_NAMED).join(', ')} and ${paths.length - UNREAD_NAMED} more)`
    : ` (${list(paths)})`;
  const groups = new Map();
  for (const file of files) {
    const key = file.part ?? null;
    if (!groups.has(key)) groups.set(key, { files: [], label: key == null ? 'no part' : (file.partLabel ?? key) });
    groups.get(key).files.push(file);
  }
  const verb = files.length === 1 ? 'uses' : 'use';
  const reason = `syntax the parser cannot read${named}, so what ${files.length === 1 ? 'it imports' : 'they import'} is not known`;
  const byPart = [...groups.entries()].some(([key, group]) => key != null && group.files.length > 1);
  if (byPart && groups.size === 1) {
    const [group] = groups.values();
    const constructs = constructList(files);
    return `${count(files.length, 'file')} in ${group.label} ${verb} ${reason}${constructs ? `: ${constructs}` : ''}.`;
  }
  const lead = `${count(files.length, 'file')} ${verb} ${reason}`;
  if (byPart) {
    const ordered = [...groups.values()].sort((a, b) => b.files.length - a.files.length || cmp(a.label, b.label));
    return `${lead}: ${ordered.map(unreadGroup).join(', ')}.`;
  }
  const constructs = constructList(files);
  return constructs ? `${lead}: ${constructs}.` : `${lead}.`;
}

function limits(ctx, shownText) {
  const lines = [];
  const externals = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.externals ?? 0), 0);
  const names = [...new Set(ctx.boundaries.flatMap((boundary) => boundary.externalNames ?? []))].sort(cmp);
  const declared = externalsLine(externals, names);
  if (declared) lines.push(declared);
  const unresolved = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.unresolvedSites ?? 0), 0);
  if (unresolved > 0) lines.push(`${count(unresolved, 'import site')} could not be resolved.`);
  const outside = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.outsideImports ?? 0), 0);
  if (outside > 0) {
    lines.push(`${count(outside, 'import site')} ${outside === 1 ? 'names' : 'name'} a path outside this repository, so what ${outside === 1 ? 'it loads' : 'they load'} is not followed.`);
  }
  const unparsed = unreadLine([...ctx.fileOf.values()].filter((file) => file.parseError).map((file) => {
    const part = ctx.boundaryOf.get(file.path) ?? null;
    return { part, partLabel: part == null ? null : ctx.shown(part), path: file.path, unreadSyntax: file.unreadSyntax };
  }));
  if (unparsed) lines.push(unparsed);
  const dynamicWrites = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.dynamicWrites ?? 0), 0);
  const dynamicReads = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.dynamicReads ?? 0), 0);
  if (dynamicWrites + dynamicReads > 0) {
    // A count of none is left out, as the outside line leaves it out.
    const what = [dynamicWrites > 0 ? count(dynamicWrites, 'write') : null, dynamicReads > 0 ? count(dynamicReads, 'read') : null].filter(Boolean);
    lines.push(`${list(what)} ${dynamicWrites + dynamicReads === 1 ? 'uses a path' : 'use paths'} built at run time and ${dynamicWrites + dynamicReads === 1 ? 'is' : 'are'} not named here.`);
  }
  if (ctx.untrackedWrites > 0) {
    lines.push(`${count(ctx.untrackedWrites, 'write')} ${ctx.untrackedWrites === 1 ? 'goes' : 'go'} to places this repository does not track, so ${ctx.untrackedWrites === 1 ? 'it is' : 'they are'} not listed as generated.`);
  }
  const outsideWrites = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.outsideWrites ?? 0), 0);
  const outsideReads = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.outsideReads ?? 0), 0);
  if (outsideWrites + outsideReads > 0) {
    const what = [outsideWrites > 0 ? count(outsideWrites, 'write') : null, outsideReads > 0 ? count(outsideReads, 'read') : null].filter(Boolean);
    const verb = outsideWrites + outsideReads === 1 ? 'goes' : 'go';
    lines.push(`${list(what)} ${verb} to the directory the command is run in, the home directory or a path its caller passes, not to this repository.`);
  }
  // Most such commands are a test spawning the command it tests, which is
  // not a gap in what the repository does; the share in tests is said.
  const dynamicSpawns = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.dynamicSpawns ?? 0), 0);
  const inTests = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.dynamicSpawnsInTests ?? 0), 0);
  if (dynamicSpawns > 0) {
    // "all of them in tests" and "2 of them in tests" read as phrases; a
    // single command needs its verb.
    const share = inTests === 0 ? '' : inTests === dynamicSpawns ? (dynamicSpawns === 1 ? ', and it is in tests' : ', all of them in tests') : `, ${inTests} of them in tests`;
    lines.push(`${count(dynamicSpawns, 'command')} ${dynamicSpawns === 1 ? 'is' : 'are'} built at run time and not followed${share}.`);
  }
  lines.push(...shellLines(ctx));
  lines.push(...httpLines(ctx), ...unseenLines(ctx));
  if (shownText) lines.push('Readers marked (found by text) come from scanning unparsed files.');
  for (const door of ctx.doors) {
    if (door.parseError) continue;
    const recorded = new Set((door.runs ?? []).map((run) => run.path)).size;
    if ((door.runsCount ?? 0) <= recorded) continue;
    const verb = (door.checksCount ?? 0) > 0 ? 'runs or checks' : 'runs';
    lines.push(`${door.name} ${verb} ${door.runsCount} files and directories; the map records ${recorded} of them, some from every directory, and walks its reach from those.`);
  }
  const confidence = ctx.statistics.confidence;
  if (confidence?.level === 'low') {
    const reason = String(confidence.reason ?? '').trim().replace(/\.$/, '');
    lines.push(reason ? `Statistics confidence is low: ${reason}.` : 'Statistics confidence is low.');
  }
  return lines;
}

const PLATFORM_NAMES = { linux: 'Linux', macos: 'macOS', windows: 'Windows' };

// A call over HTTP is drawn as an edge, but no door's reach crosses it, so
// the page says each one.
function httpLines(ctx) {
  return (ctx.structure.edges ?? [])
    .filter((edge) => edge.kind === 'http' && edge.from !== edge.to)
    .map((edge) => `${ctx.shown(edge.from)} calls ${ctx.shown(edge.to)} over HTTP at ${count(edge.routes ?? 1, 'route')}, a link no import shows: the map draws it, and no door's reach follows it.`);
}

/**
 * The apps the map reads none of and the deployments no workflow reaches
 * (core/unseen.js), each said as what the page cannot show.
 */
function unseenLines(ctx) {
  const lines = [];
  for (const entry of ctx.structure.unseen ?? []) {
    const where = entry.dir ? `under ${entry.dir}/` : 'at the repository root';
    const what = entry.kind === 'tauri' ? 'a Tauri app' : 'a Rust crate';
    // A workflow may build the Rust; the map still reads none of it.
    if (entry.kind === 'tauri' || entry.kind === 'crate') {
      lines.push(entry.built
        ? `There is ${what} ${where} (${count(entry.rust, 'Rust file')}) that a workflow builds; the map reads no Rust, so what its Rust code does is not on this page.`
        : `There is ${what} ${where} (${count(entry.rust, 'Rust file')}) that no workflow builds; the map reads no Rust, so what it does is not on this page.`);
    } else if (entry.kind === 'deploy') {
      const files = entry.files ?? [];
      const dockerfiles = files.filter((path) => /(^|\/)(Dockerfile[^/]*|[^/]+\.Dockerfile)$/.test(path));
      const others = files.filter((path) => !dockerfiles.includes(path));
      const named = [
        ...(dockerfiles.length === 1 ? [dockerfiles[0].includes('/') ? `a Dockerfile at ${dockerfiles[0]}` : 'a Dockerfile'] : dockerfiles.length > 1 ? [count(dockerfiles.length, 'Dockerfile')] : []),
        ...others.map((path) => `a ${path}`),
      ];
      const them = files.length === 1 ? 'it' : 'them';
      lines.push(`There is ${list(named)} that no workflow runs; what deploys from ${them} does so from outside this repository, and is not on this page.`);
    }
  }
  return lines;
}

/**
 * The files a door's shell leaves out of a glob its commands hand a tool:
 * "3 test files under `src/` are not run by CI on Linux, where the shell
 * expands `**` as one directory level." Doors that leave out the same files
 * are named together. This is the repository's own gap, said as found; the
 * map does not read the glob as the tool would have.
 *
 * @param {object} ctx
 * @returns {string[]}
 */
function shellLines(ctx) {
  const groups = new Map();
  for (const door of ctx.doors) {
    for (const entry of door.parseError ? [] : door.shellMissed ?? []) {
      const key = JSON.stringify([entry.base, entry.files, entry.platform, Boolean(entry.tests), Boolean(entry.twoStars)]);
      if (!groups.has(key)) groups.set(key, { entry, doors: [] });
      groups.get(key).doors.push(door.name);
    }
  }
  return [...groups.values()].map(({ entry, doors }) => shellLine(entry, doors));
}

function shellLine(entry, doors) {
  const what = count(entry.files, entry.tests ? 'test file' : 'file');
  const where = entry.base === '' ? 'at the repository root' : `under \`${entry.base}\``;
  const verb = entry.files === 1 ? 'is' : 'are';
  const why = entry.twoStars ? 'where the shell expands `**` as one directory level' : 'where the shell expands the glob before the tool sees it';
  return `${what} ${where} ${verb} not run by ${list(doors)} on ${PLATFORM_NAMES[entry.platform] ?? entry.platform}, ${why}.`;
}

// One fact per bullet: GitHub joins bare consecutive lines into one paragraph.
function limitsSection(lines) {
  const regenerate = 'Regenerate with `npx --yes @dogfood-lab/atlas map`.';
  const sections = ['## What this map cannot see'];
  if (lines.length > 0) sections.push(lines.map((line) => `- ${line}`).join('\n'));
  sections.push(regenerate);
  return sections.join('\n\n');
}

/**
 * The heading of "What changed since …", from the changes object alone, so
 * the markdown and the site word it the same way.
 *
 * @param {object} changes
 * @returns {string}
 */
export function changesHeading(changes) {
  if (!changes || changes.first) return 'What changed since the last map';
  const date = String(changes.since?.generatedAt ?? '').slice(0, 10);
  const commit = String(changes.since?.commit ?? '').slice(0, 7);
  if (date && commit) return `What changed since ${date} (${commit})`;
  if (commit) return `What changed since commit ${commit}`;
  return date ? `What changed since ${date}` : 'What changed since the last map';
}

// Nothing structural changed is one line, not a list of one; the first map
// has nothing to compare and says so.
function changesSection(changes) {
  const heading = `## ${changesHeading(changes)}`;
  if (changes.first) return [heading, 'This is the first map.'].join('\n\n');
  const items = changes.items ?? [];
  if (changes.unchanged) return [heading, items.map((item) => item.sentence).join(' ')].join('\n\n');
  return [heading, items.map((item) => `- ${item.sentence}`).join('\n')].join('\n\n');
}

function summaryOf(document) {
  const text = typeof document?.summary === 'string' ? document.summary.replace(/\s+/g, ' ').trim() : '';
  return text || null;
}

const LANGUAGE_NAMES = { javascript: 'JavaScript', python: 'Python', tsx: 'TypeScript', typescript: 'TypeScript' };
// A command's name is what a reader types, so up to twelve are all named;
// past that, ten are and the rest counted.
const INSTALLED_ALL = 12;
const INSTALLED_NAMED = 10;

// "mostly TypeScript (412 files)" when one language holds most of the code
// files, every language otherwise, and nothing when there is no code. When
// images are most of the tracked files, the images come first and the code
// after them: a sprite pack's four scripts are not what it is.
function languageClause(ctx) {
  const counts = new Map();
  let images = 0;
  for (const path of ctx.fileOf.keys()) {
    if (isImagePath(path)) images += 1;
    const language = LANGUAGE_NAMES[languageOf(path)];
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));
  if (images * 2 > ctx.fileOf.size) {
    const lead = `, mostly images (${count(images, 'file')})`;
    return ranked.length === 0 ? lead : `${lead}; code in ${list(ranked.map(([name, n]) => `${name} (${n})`))}`;
  }
  if (ranked.length === 0) return '';
  const total = ranked.reduce((sum, [, n]) => sum + n, 0);
  const [name, n] = ranked[0];
  if (n * 2 > total) return `, mostly ${name} (${count(n, 'file')})`;
  return `, in ${list(ranked.map(([other, m]) => `${other} (${count(m, 'file')})`))}`;
}

function doorsSentence(ctx, main) {
  if (ctx.doors.length === 0) return 'No workflows were found, so this page has no doors.';
  const doors = count(ctx.doors.length, 'door');
  if (!main && ctx.doors.some((door) => !door.parseError)) return `Work enters through ${doors}, and none of them runs a file this map can see.`;
  if (!main) return `Work enters through ${doors}, and none of their workflows could be read.`;
  const reach = count(reachSize(main), 'part');
  const wider = widerDoor(ctx.doors, main);
  if (wider) {
    const but = wider.pushesForReview ? 'commits only to a branch for review' : wider.pushesTo?.length > 0 ? 'commits only to another branch' : 'commits nothing';
    return `Work enters through ${doors}; the busiest is ${main.name}, which reaches ${reach} and commits into the repository (${wider.name} reaches ${reachSize(wider)} but ${but}).`;
  }
  // The doors that reach as far as the one followed, the commands and the
  // package a manifest installs among them, are named with it, and the
  // reason it is the one followed is said.
  const tied = reaching(ctx.doors).filter((door) => reachSize(door) === reachSize(main));
  if (tied.length > 1 && tied.includes(main)) {
    const others = tied.filter((door) => door !== main);
    // The reason is the first way byReach (and mainDoor's preference for a
    // door that commits) tells the followed door from the rest.
    const alike = others.filter((door) => pullRequested(door) === pullRequested(main));
    const running = alike.filter((door) => checksOnly(door) === checksOnly(main) && scheduleOnly(door) === scheduleOnly(main));
    const why = commits(main) && !others.every(commits) ? 'it commits into the repository'
      : pullRequested(main) && alike.length === 0 ? 'a pull request goes through it'
        : !checksOnly(main) && alike.every(checksOnly) ? 'it runs code, where the others only check it'
          : !installed(main) && running.length > 0 && running.every(installed) ? 'it is a workflow, where the others are installed for people to use'
            : 'it comes first by name';
    return `Work enters through ${doors}; ${list([main, ...others].map((door) => door.name))} each reach ${reach}, and ${main.name} is followed because ${why}.`;
  }
  return `Work enters through ${doors}; the busiest is ${main.name}, which reaches ${reach}.`;
}

// Every registry any door publishes to, worded the way a door's own sentence
// words it.
function publishesSentence(ctx) {
  const to = new Set();
  const packages = new Map();
  const add = (sends) => {
    for (const name of Array.isArray(sends.publishesTo) ? sends.publishesTo : sends.publishes ? ['npm'] : []) to.add(name);
    for (const entry of sends.packages ?? []) packages.set(JSON.stringify(entry), entry);
  };
  for (const door of ctx.doors) {
    add(door.sends ?? {});
    for (const entry of door.gated ?? []) add(sendsFrom(entry.sends));
  }
  const phrase = publishPhrase({ publishesTo: [...to].sort(cmp), packages: [...packages.values()] });
  return phrase ? `It ${phrase}.` : null;
}

// A package nothing here publishes is no package people import, and an
// extension is installed, not imported.
function installedNames(ctx, kind, { extension = false } = {}) {
  const names = [...new Set(ctx.doors.filter((door) => door.kind === kind && !door.unpublished && Boolean(door.extension) === extension).map((door) => door.name))].sort(cmp);
  if (names.length <= INSTALLED_ALL) return list(names);
  return `${names.slice(0, INSTALLED_NAMED).join(', ')} and ${names.length - INSTALLED_NAMED} more`;
}

/**
 * The line "What this is" derives when no person has written one, and after
 * the one a person wrote: how many parts and what they are written in, how
 * work enters, where the repository publishes, and what it installs for
 * people to run or import.
 */
function derivedLine(ctx, main) {
  const sentences = [`${count(ctx.boundaries.length, 'part')}${languageClause(ctx)}.`, doorsSentence(ctx, main)];
  const published = publishesSentence(ctx);
  if (published) sentences.push(published);
  const commands = installedNames(ctx, 'command');
  if (commands) sentences.push(`People run ${commands}.`);
  const packages = installedNames(ctx, 'package');
  if (packages) sentences.push(`People import ${packages}.`);
  const extensions = installedNames(ctx, 'package', { extension: true });
  if (extensions) sentences.push(`People install the ${extensions} extension.`);
  return sentences.join(' ');
}

function doorData(ctx, door) {
  if (door.parseError) return { file: door.file, id: doorKey(door), name: door.name, parseError: true };
  return {
    file: door.file,
    id: doorKey(door),
    ...(installed(door) ? { kind: door.kind } : {}),
    landings: writes(ctx, door),
    name: door.name,
    ...(door.programs?.length > 0 ? { programs: [...door.programs] } : {}),
    pushes: door.pushes === true,
    ...(door.pushesForReview ? { pushesForReview: true } : {}),
    ...(door.pushesTo ? { pushesTo: door.pushesTo } : {}),
    reach: (door.reach ?? []).map((entry) => ({ boundary: entry.boundary, depth: entry.depth, files: entry.files })),
    checks: shownRuns(door, 'checks'),
    checksCount: runTotal(door, 'checks'),
    checksMore: moreFiles(ctx, shownRuns(door, 'checks'), unrecordedRuns(door, 'checks')),
    ...(gatedRuns(door).length > 0
      ? { held: gatedRuns(door).map((group) => ({ checks: shownRuns(door, 'checks', group.paths), checksMore: moreFiles(ctx, shownRuns(door, 'checks', group.paths)), lead: gateLead(group.when), runs: shownRuns(door, 'executes', group.paths), runsMore: moreFiles(ctx, shownRuns(door, 'executes', group.paths)), when: gatePhrase(group.when) })) }
      : {}),
    runs: shownRuns(door, 'executes'),
    runsCount: runTotal(door, 'executes'),
    runsMore: moreFiles(ctx, shownRuns(door, 'executes'), unrecordedRuns(door, 'executes')),
    sends: sendPhrases(door),
    stages: stagedShown(door.stages),
    triggers: triggerPhrases(door),
    ...(door.unplaced ? { unplaced: door.unplaced } : {}),
    ...(door.unpublished ? { unpublished: true } : {}),
    ...(door.extension ? { extension: true } : {}),
    ...(door.publishedTo ? { publishedTo: registryList(door.publishedTo) } : {}),
  };
}

/**
 * @param {{ structure: object, statistics: object, document: object, repoName: string, defaultBranch?: string, changes?: object }} input
 *   changes is the delta from the map committed at HEAD (adapter/changes.js);
 *   without it the page has no "What changed since …" section. defaultBranch
 *   is the branch a person edits on, read from git by the caller, since
 *   nothing here reads the tree
 * @returns {{ markdown: string, json: string }}
 */
export function buildPage({ structure, statistics, document, repoName, defaultBranch = 'main', changes = null }) {
  const ctx = facts({ structure, statistics: statistics ?? {} });
  const commit = String(statistics?.generatedFrom?.commit ?? structure.generatedFrom?.commit ?? '');
  const generatedAt = String(statistics?.generatedAt ?? '');
  const name = String(repoName ?? '').split('/').pop() || 'this repository';
  const summary = summaryOf(document);
  const main = mainDoor(ctx.doors);
  const groups = main ? readerGroups(ctx, main) : [];
  const breakEntries = breaks(ctx);
  const { pairs, withTests } = together(ctx);
  const pairNote = togetherNote(ctx, pairs, withTests);
  const untestedParts = untested(ctx);
  const unreadPlaces = unread(ctx);
  const duplicated = { ...duplicates(ctx), unread: unreadCount(ctx) };
  const generatedItems = generated(ctx);
  const authoredBoundaries = authored(ctx);
  const sharedPlaces = writtenByPeople(ctx);
  // A pull request's door that runs no code the map can follow leaves the
  // path to the busiest door, as before a pull request's door was preferred.
  let starting = startDoor(ctx, main);
  let start = { chain: [], words: [] };
  let reason = null;
  // A pull request that runs only tests enters the code through what the
  // tests import, which is no way a person uses it; the path follows the
  // command or package the manifest installs instead, from its entry.
  const tested = testsOnly(ctx, starting);
  if (tested) {
    for (const door of installedStart(ctx)) {
      const found = startHere(ctx, door);
      if (found.chain.length === 0) continue;
      reason = startReason(starting, door, tested);
      starting = door;
      start = found;
      break;
    }
  }
  if (start.chain.length === 0 && starting) start = startHere(ctx, starting);
  if (start.chain.length === 0 && starting !== main && main) {
    const fallback = startHere(ctx, main);
    if (fallback.chain.length > 0) {
      starting = main;
      start = fallback;
    }
  }
  const found = main ? sequences(ctx, main) : [];
  const shownText = groups.some((group) => group.readers.some((reader) => reader.text?.endsWith(' (found by text)')));
  const limitLines = limits(ctx, shownText);

  const derived = derivedLine(ctx, main);
  const whatThisIs = ['## What this is'];
  if (summary) whatThisIs.push(`${summary} (written by a person)`);
  whatThisIs.push(derived);

  const sections = [
    [`# ${name}: how it works`, `Mapped at ${generatedAt.slice(0, 10)} from commit ${commit.slice(0, 7)}.`].join('\n\n'),
    whatThisIs.join('\n\n'),
  ];
  if (changes) sections.push(changesSection(changes));
  if (ctx.doors.length > 0) sections.push(comesIn(ctx));
  if (main) {
    sections.push(happens(ctx, main, found), readsSection(ctx, main, groups));
    const others = otherDoors(ctx, main);
    if (others) sections.push(others);
  }
  sections.push(
    breaksSection(ctx, breakEntries),
    togetherSection(ctx, pairs, withTests, pairNote),
    untestedSection(untestedParts),
    unreadSection(ctx, unreadPlaces),
    duplicatesSection(duplicated),
    generatedSection(ctx, generatedItems),
    authoredSection(ctx, authoredBoundaries, sharedPlaces),
    startSection(start.words, starting, ctx.doors.some((door) => !door.parseError), reason),
    limitsSection(limitLines),
  );
  const markdown = `${sections.join('\n\n')}\n`;

  const data = {
    authored: authoredBoundaries.map(boundaryPlace),
    ...(sharedPlaces.length > 0 ? { authoredWritten: sharedPlaces.map((item) => ({ ...item, writers: worded(item.writers, id) })) } : {}),
    breaks: breakEntries,
    ...(changes ? { changes } : {}),
    changesTogether: pairs,
    changesTogetherNote: pairNote,
    changesTogetherWithTests: withTests,
    commit,
    defaultBranch: String(defaultBranch || 'main'),
    derived,
    doors: ctx.doors.map((door) => doorData(ctx, door)),
    duplicates: duplicated.items,
    duplicatesLead: duplicated.lead,
    duplicatesNote: duplicated.note,
    edges: breakEdges(ctx, breakEntries),
    generated: generatedItems.map((item) => ({ ...(item.addedBy ? { addedBy: item.addedBy } : {}), ...(item.block ? { block: true } : {}), ...(item.once ? { once: true } : {}), place: item.place, writers: worded(item.writers, id) })),
    generatedAt,
    limits: limitLines,
    mainDoor: main ? doorKey(main) : null,
    partLabels: ctx.partLabels,
    parts: ctx.boundaries.length,
    readers: groups.map((group) => ({ readers: worded(group.readers, id), target: group.target, ...(group.tests ? { tests: group.tests } : {}) })),
    repo: String(repoName ?? ''),
    sequences: found,
    startDoor: starting ? doorKey(starting) : null,
    startHere: start.chain,
    ...(reason ? { startReason: reason } : {}),
    ...(starting && start.chain.length === 0 ? { startNote: noPath(starting) } : {}),
    summary,
    summaryFrom: summary ? 'person' : null,
    ...(untestedParts.spawned.length > 0 ? { spawnTested: untestedParts.spawned } : {}),
    testedBy: untestedParts.testedBy,
    testFiles: untestedParts.testFiles,
    unreadFiles: unreadCount(ctx),
    unread: unreadPlaces.items.map((item) => ({ place: item.place, writers: worded(item.writers, id) })),
    unreadNote: unreadPlaces.note,
    written: unreadPlaces.written,
    untested: untestedParts.items,
    untestedNote: untestedParts.note,
    unnamedWrites: unnamedWrites(ctx),
  };
  return { markdown, json: `${JSON.stringify(sortKeys(data), null, 2)}\n` };
}

/**
 * The order of work inside one file's entry function, worded the way the page
 * words it, for a caller that explains a single file rather than a door.
 *
 * @param {object} ctx  from pageFacts
 * @param {string} path a tracked path
 * @param {(phrase: string) => string} lead the words before the steps, given the entry's phrase
 * @returns {null | { entry: string, file: string, part: string|null, partLabel: string|null, phrase: string, steps: object[], sentence: string }}
 */
export function entryOrder(ctx, path, lead) {
  const file = ctx.fileOf.get(path);
  const root = (file?.sequences ?? []).find((sequence) => sequence.name === file.entry);
  if (!root) return null;
  const steps = stepUnits(ctx, root.calls);
  if (steps.calls === 0) return null;
  const part = ctx.boundaryOf.get(path) ?? null;
  return {
    entry: file.entry,
    file: path,
    part,
    partLabel: label(ctx, part),
    phrase: words(file.entry),
    steps: steps.units,
    sentence: inOrder(lead(words(file.entry)), unitTexts(ctx, steps.units, part), ''),
  };
}

// The page's reading of the artifacts and its phrase helpers, shared with
// atlas explain so a sentence about one file reads as the page would write it.
export { collapse, cover, facts as pageFacts, readerFiles, under, worded };
