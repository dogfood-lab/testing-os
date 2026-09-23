import { isSourcePath } from '../core/history.js';
import { isTestMaterial, ownTestPair } from '../core/landings.js';

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
const INNER_STEPS = 3;
const PAIRS_SHOWN = 5;
const UNTESTED_SHOWN = 8;
const UNREAD_SHOWN = 8;
const DUPLICATES_SHOWN = 5;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ROOT_NAME = 'the repository root';

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

function topLevel(path) {
  const slash = path.indexOf('/');
  return slash === -1 ? path : path.slice(0, slash);
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
  return globs.length > 0 && globs.every(rootLevel) ? ROOT_NAME : boundary.name;
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
  const names = new Map(boundaries.map((boundary) => [boundary.name, displayName(boundary)]));
  return {
    structure,
    statistics,
    boundaries,
    boundaryOf,
    fileOf,
    shown: (name) => names.get(name) ?? name,
    place: (target) => (isDir(target) ? `${target}/` : target),
    doors: orderDoors(structure.doors ?? []),
    // A weak landing is a bare file name under a root the engine could not
    // read; it stays in the artifact, and the page states nothing from it.
    landings: (structure.landings ?? []).map((landing) => ({
      target: landing.target,
      writers: (landing.writers ?? []).filter(strong),
      readers: (landing.readers ?? []).filter(strong),
    })),
  };
}

function strong(entry) {
  return entry.confidence !== 'weak';
}

function reachSize(door) {
  return door.parseError ? 0 : (door.reach ?? []).length;
}

export function orderDoors(doors) {
  return [...doors].sort((a, b) => reachSize(b) - reachSize(a) || cmp(a.name, b.name) || cmp(a.file, b.file));
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

function runPaths(door) {
  return [...new Set((door.runs ?? []).map((run) => run.path))].sort(cmp);
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

function pushPhrase(trigger) {
  if (trigger.tags?.length > 0) {
    return `when a tag matching ${list(trigger.tags.map((tag) => `\`${tag}\``)).replace(/ and /g, ' or ')} is pushed`;
  }
  let phrase = 'on a push';
  if (trigger.branches?.length > 0) phrase += ` to ${list(trigger.branches)}`;
  if (trigger.paths?.length > 0) phrase += ` touching ${count(trigger.paths.length, 'path')}`;
  return phrase;
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
        phrases.push(pushPhrase(trigger));
        break;
      case 'pull_request':
      case 'pull_request_target':
        phrases.push('on a pull request');
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
  const first = (door.triggers ?? []).find((trigger) => trigger.event !== 'workflow_dispatch') ?? door.triggers?.[0];
  if (!first) return 'run';
  if (first.event === 'repository_dispatch' && first.types?.length > 0) return first.types[0].replace(/[_-]+/g, ' ');
  if (first.event === 'repository_dispatch') return 'dispatch';
  if (first.event === 'schedule') return 'scheduled run';
  if (first.event === 'push') return first.tags?.length > 0 ? 'tag push' : 'push';
  if (first.event === 'pull_request' || first.event === 'pull_request_target') return 'pull request';
  if (first.event === 'workflow_dispatch') return 'run by hand';
  return 'run';
}

// Two staged places already hold an "and", so the push is joined with "then".
function commitsClause(door) {
  const stages = door.stages ?? [];
  if (!door.pushes) return list(stages);
  return stages.length > 1 ? `${list(stages)}, then pushes` : `${list(stages)} and pushes`;
}

function sendPhrases(door) {
  const sends = door.sends ?? {};
  const phrases = [];
  for (const repo of sends.dispatchesTo ?? []) phrases.push(`sends a dispatch to ${repo}`);
  if (sends.publishes) phrases.push('publishes to npm');
  if (sends.releases) phrases.push('creates a GitHub release');
  if (sends.deploysPages) phrases.push('deploys the site');
  return phrases;
}

export function runsShown(paths) {
  if (paths.length <= RUNS_SHOWN) return list(paths);
  return `${paths.slice(0, RUNS_SHOWN).join(', ')} and ${paths.length - RUNS_SHOWN} more`;
}

function comesIn(ctx) {
  const lines = ['## What comes in'];
  const items = ctx.doors.map((door, index) => {
    if (door.parseError) return `${index + 1}. **${door.name}.** This workflow could not be read.`;
    const when = capitalize(triggerPhrases(door).join('; ')) || 'Nothing this map can read starts it';
    const paths = runPaths(door);
    const runs = paths.length > 0 ? `Runs ${runsShown(paths)}.` : 'Runs no file this map can see.';
    return `${index + 1}. **${door.name}.** ${when}. ${runs}`;
  });
  lines.push(items.join('\n'));
  return lines.join('\n\n');
}

function fileCount(ctx, entry) {
  return `${ctx.shown(entry.boundary)} (${count(entry.files, 'file')})`;
}

function runGroups(ctx, door) {
  const groups = new Map();
  for (const path of runPaths(door)) {
    const boundary = ctx.boundaryOf.get(path) ?? null;
    const key = boundary ?? `\0${path}`;
    if (!groups.has(key)) groups.set(key, { boundary, paths: [] });
    groups.get(key).paths.push(path);
  }
  const order = new Map((door.reach ?? []).map((entry, index) => [entry.boundary, index]));
  const ordered = [...groups.values()].sort((a, b) => (
    (order.get(a.boundary) ?? Infinity) - (order.get(b.boundary) ?? Infinity) || cmp(a.paths[0], b.paths[0])
  ));
  const parts = ordered.map((group) => (group.boundary ? `${list(group.paths)} in ${ctx.shown(group.boundary)}` : list(group.paths)));
  return list(parts, { serial: ordered.some((group) => group.paths.length > 1) });
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
  const paths = runPaths(door);
  steps.push(paths.length > 0 ? `The workflow runs ${runGroups(ctx, door)}.` : 'The workflow runs no file this map can see.');
  for (const level of deeper(door)) steps.push(`That reaches ${list(level.entries.map((entry) => fileCount(ctx, entry)))}.`);
  const places = writes(ctx, door);
  if (places.length > 0) steps.push(`It writes to ${list(places)}.`);
  if ((door.stages ?? []).length > 0) steps.push(`It commits ${commitsClause(door)}.`);
  const sends = door.sends ?? {};
  for (const repo of sends.dispatchesTo ?? []) steps.push(`It sends a dispatch to ${repo}.`);
  if (sends.publishes) steps.push('It publishes to npm.');
  if (sends.releases) steps.push('It creates a GitHub release.');
  if (sends.deploysPages) steps.push('It deploys the site.');
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
  const shown = calls.filter((call) => !call.passed);
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
  for (const path of runPaths(door)) {
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
    out.push({ entry: file.entry, file: path, inner, part, partLabel: label(ctx, part), phrase: words(file.entry), steps: steps.units });
  }
  return out;
}

function sequenceLines(ctx, found) {
  const lines = [];
  for (const sequence of found) {
    lines.push(inOrder(`Inside ${sequence.file}, ${sequence.phrase} does, in order:`, unitTexts(ctx, sequence.steps, sequence.part), SUB_INDENT));
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
// part is kept as its id, so the page and page.json can each word it.
function collapse(ctx, entries) {
  const byBoundary = new Map();
  const loose = [];
  for (const entry of entries) {
    const boundary = ctx.boundaryOf.get(entry.path);
    if (!boundary) {
      loose.push(entry);
      continue;
    }
    if (!byBoundary.has(boundary)) byBoundary.set(boundary, []);
    byBoundary.get(boundary).push(entry);
  }
  const items = [...loose.map((entry) => ({ key: entry.path, text: entry.text }))];
  for (const [boundary, members] of byBoundary) {
    if (members.length > COLLAPSE_OVER) {
      const paths = members.map((entry) => entry.path).sort(cmp);
      items.push({ key: paths[0], boundary, files: `${members.length} ${nounOf(paths)}` });
    } else {
      for (const entry of members) items.push({ key: entry.path, text: entry.text });
    }
  }
  return items.sort((a, b) => cmp(a.key, b.key));
}

function worded(items, name) {
  return items.map((item) => item.text ?? `${name(item.boundary)} (${item.files})`);
}

// A reader is found by text only when every read it makes of the place is.
function readerFiles(entries) {
  const byPath = new Map();
  for (const entry of entries) {
    const text = entry.confidence === 'text';
    byPath.set(entry.by, byPath.has(entry.by) ? byPath.get(entry.by) && text : text);
  }
  return [...byPath.entries()].sort((a, b) => cmp(a[0], b[0])).map(([path, text]) => ({ path, text }));
}

function readerGroups(ctx, main) {
  const groups = new Map();
  for (const target of main.landings ?? []) {
    const key = topLevel(target);
    if (!groups.has(key)) groups.set(key, { key, entries: [] });
  }
  for (const entry of (main.readers ?? []).filter(strong)) {
    const group = groups.get(topLevel(entry.target));
    if (group) group.entries.push(entry);
  }
  const out = [];
  for (const group of [...groups.values()].sort((a, b) => cmp(a.key, b.key))) {
    const target = ctx.place(group.key);
    if (group.entries.length === 0) {
      out.push({ target, readers: [], files: [] });
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
    const readers = collapse(ctx, files.map((reader) => ({
      path: reader.path,
      text: reader.text ? `${reader.path} (found by text)` : reader.path,
    })));
    out.push({ target, readers, files });
  }
  return out;
}

function readsSection(ctx, main, groups) {
  const lines = ['## Who reads the results'];
  if ((main.landings ?? []).length === 0) {
    lines.push(`${main.name} writes nothing this map can see.`);
    return lines.join('\n\n');
  }
  const bullets = groups.map((group) => (group.readers.length === 0
    ? `- **${group.target}** has no reader in this repository.`
    : `- **${group.target}** is read by ${list(worded(group.readers, ctx.shown))}.`));
  lines.push(bullets.length > 0 ? bullets.join('\n') : `Only ${main.name} itself reads what it writes.`);
  return lines.join('\n\n');
}

function otherDoors(ctx, main) {
  const rest = ctx.doors.filter((door) => door !== main);
  if (rest.length === 0) return null;
  const paragraphs = rest.map((door) => {
    if (door.parseError) return `**${door.name}.** This workflow could not be read.`;
    const clauses = [];
    const paths = runPaths(door);
    clauses.push(paths.length > 0 ? `runs ${runsShown(paths)}` : 'runs no file this map can see');
    const reached = [...new Set(deeper(door).flatMap((level) => level.entries.map((entry) => entry.boundary)))].sort(cmp);
    if (reached.length > 0) clauses.push(`reaches ${list(reached.map(ctx.shown))}`);
    const places = writes(ctx, door);
    if (places.length > 0) clauses.push(`writes to ${list(places)}`);
    const stages = door.stages ?? [];
    if (stages.length > 0) clauses.push(`commits ${commitsClause(door)}`);
    clauses.push(...sendPhrases(door));
    return `**${door.name}** ${clauseList(clauses)}.`;
  });
  return ['## The other doors', paragraphs.join('\n\n')].join('\n\n');
}

function importers(ctx) {
  const from = new Map(ctx.boundaries.map((boundary) => [boundary.name, new Set()]));
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from === edge.to) continue;
    if (!from.has(edge.to)) from.set(edge.to, new Set());
    from.get(edge.to).add(edge.from);
  }
  return from;
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

function writtenPlaces(ctx) {
  const written = ctx.landings.filter((landing) => landing.writers.length > 0).map((landing) => landing.target);
  return cover(written).map((target) => {
    const inside = ctx.landings.filter((landing) => under(landing.target, target));
    const writers = [...new Set(inside.flatMap((landing) => landing.writers.map((entry) => entry.by)))].sort(cmp);
    // A workflow that names a place it also writes is describing its own output.
    const reads = inside.flatMap((landing) => landing.readers).filter((entry) => entry.call != null || !writers.includes(entry.by));
    const readers = readerFiles(reads).filter((reader) => !under(reader.path, target));
    return { target, writers, readers };
  });
}

function partsOf(ctx, paths) {
  return [...new Set(paths.map((path) => ctx.boundaryOf.get(path) ?? path))].sort(cmp);
}

function breaks(ctx) {
  const from = importers(ctx);
  const on = doorsThrough(ctx);
  const places = writtenPlaces(ctx)
    .filter((place) => place.readers.length >= 2)
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
      importedBy: [...(from.get(boundary.name) ?? [])].sort(cmp),
      doors: on.get(boundary.name) ?? 0,
    }))
    .filter((part) => part.importedBy.length > 0 || part.doors >= 2)
    .sort((a, b) => b.importedBy.length - a.importedBy.length || b.doors - a.doors || cmp(a.name, b.name))
    .slice(0, BREAK_LINES - places.length);
  return [...parts, ...places];
}

function breakLine(ctx, entry) {
  if (entry.kind === 'place') {
    const comma = entry.writers.length > 1 ? ',' : '';
    const writers = list(entry.writers.map(ctx.shown));
    return `- **${entry.target}** is written by ${writers}${comma} and read by ${list(entry.readers.map(ctx.shown))}; a hand edit reaches every reader.`;
  }
  const imported = entry.importedBy.length === 0
    ? 'is imported by no other part'
    : `is imported by ${count(entry.importedBy.length, 'part')} (${entry.importedBy.map(ctx.shown).join(', ')})`;
  const path = entry.doors === 0 ? 'no door' : count(entry.doors, 'door');
  return `- **${ctx.shown(entry.name)}** ${imported} and sits on the path of ${path}.`;
}

function breaksSection(ctx, entries) {
  const body = entries.length > 0
    ? entries.map((entry) => breakLine(ctx, entry)).join('\n')
    : 'No part is imported by another part, and no part sits on the path of two doors.';
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

function relationOf(imports, partA, partB) {
  if (partA == null || partB == null) return 'unassigned';
  if (partA === partB) return 'inside';
  const ab = imports(partA, partB);
  const ba = imports(partB, partA);
  if (ab && ba) return 'both';
  if (ab) return 'a-imports-b';
  if (ba) return 'b-imports-a';
  return 'none';
}

// The coupling population is source files only, the same rule the statistics
// use for cohesion: two docs edited in one commit say nothing about code. A
// file and its own test changing together is expected and tells a reader
// nothing, so those pairs are counted and kept out of the ranking.
function together(ctx) {
  const imports = importsBetween(ctx);
  const source = (ctx.statistics.pairs ?? []).filter((pair) => isSourcePath(pair.a) && isSourcePath(pair.b));
  const pairs = source
    .filter((pair) => !ownTestPair(pair.a, pair.b))
    .sort((x, y) => y.strength - x.strength || y.shared - x.shared || cmp(x.a, y.a) || cmp(x.b, y.b))
    .slice(0, PAIRS_SHOWN)
    .map((pair) => {
      const parts = [ctx.boundaryOf.get(pair.a) ?? null, ctx.boundaryOf.get(pair.b) ?? null];
      const partLabels = parts.map((part) => label(ctx, part));
      return { a: pair.a, b: pair.b, either: pair.either, partLabels, parts, relation: relationOf(imports, parts[0], parts[1]), shared: pair.shared };
    });
  return { pairs, withTests: source.filter((pair) => ownTestPair(pair.a, pair.b)).length };
}

// A part's name is often a common word ("tests imports backpropagate"), so a
// sentence about parts says "the tests part". The repository root is already
// a phrase.
function partPhrase(partLabel) {
  return partLabel === ROOT_NAME ? partLabel : `the ${partLabel} part`;
}

function relationClause(pair) {
  const [a, b] = pair.partLabels.map(partPhrase);
  switch (pair.relation) {
    case 'inside': return `, inside ${a}.`;
    case 'a-imports-b': return `, and ${a} imports ${b}.`;
    case 'b-imports-a': return `, and ${b} imports ${a}.`;
    case 'both': return `, and ${a} and ${b} import each other.`;
    case 'none': return ', though neither part imports the other.';
    default: return '.';
  }
}

function windowLine(parameters) {
  const span = typeof parameters?.windowDays === 'number'
    ? `${count(parameters.windowDays, 'day')}`
    : (parameters?.pinnedStart ? `since ${parameters.pinnedStart}` : null);
  const floor = typeof parameters?.sharedFloorUsed === 'number'
    ? `a pair counts from ${count(parameters.sharedFloorUsed, 'shared commit')}`
    : null;
  const parts = [span, floor].filter(Boolean);
  return parts.length > 0 ? `Window: ${parts.join('; ')}.` : null;
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
  if (testFiles === 0) return { items: [], note: ['No test files were found by name.'], testedBy, testFiles };
  const all = parts.filter((boundary) => (boundary.testedBy ?? 0) === 0)
    .map((boundary) => ({ part: boundary.name, partLabel: ctx.shown(boundary.name), testedBy: 0 }));
  return { items: all.slice(0, UNTESTED_SHOWN), note: more(all.length, UNTESTED_SHOWN, 'part'), testedBy, testFiles };
}

function untestedSection(found) {
  const body = found.items.length > 0
    ? found.items.map((item) => `- **${item.partLabel}** is imported by no test.`).join('\n')
    : (found.testFiles === 0 ? null : 'Every code part is imported by at least one test.');
  return ['## What no test touches', ...(body ? [body] : []), ...found.note].join('\n\n');
}

// A place is unread when nothing but its own writers reads it: a writer that
// reads back what it wrote is making the result, not using it.
function unread(ctx) {
  const written = writtenPlaces(ctx);
  const all = written
    .filter((place) => place.readers.every((reader) => place.writers.includes(reader.path)))
    .map((place) => ({
      place: ctx.place(place.target),
      writers: collapse(ctx, place.writers.map((path) => ({ path, text: path }))),
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
    : (found.written === 0 ? 'No place this map can see is written, so none goes unread.' : 'Every written place has a reader.');
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
 * repository's.
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
    for (let i = 0; i < owners.length; i += 1) {
      for (let j = i + 1; j < owners.length; j += 1) {
        const [a, b] = [owners[i], owners[j]];
        if (a.part === b.part || ownTestPair(a.path, b.path)) continue;
        const alike = a.calls && b.calls ? sameCalls(a.calls, b.calls) : baseName(a.path) === baseName(b.path);
        if (!alike) continue;
        all.push({ files: [a.path, b.path], name, partLabels: [ctx.shown(a.part), ctx.shown(b.part)], parts: [a.part, b.part] });
      }
    }
  }
  const items = all.slice(0, DUPLICATES_SHOWN);
  return {
    items,
    lead: items.length > 0 ? 'These are candidates from names and call order, not a judgement.' : null,
    note: more(all.length, DUPLICATES_SHOWN, 'pair'),
  };
}

function duplicatesSection(found) {
  const body = found.items.length > 0
    ? found.items.map((item) => `- **${item.name}** is exported by ${item.files[0]} (${item.partLabels[0]}) and ${item.files[1]} (${item.partLabels[1]}); the two look alike.`).join('\n')
    : 'No two parts export a helper that looks alike.';
  return ['## Helpers that look duplicated', ...(found.lead ? [found.lead] : []), body, ...found.note].join('\n\n');
}

function generated(ctx) {
  const items = [];
  const claimed = [];
  const written = writtenPlaces(ctx);
  for (const boundary of ctx.boundaries.filter((item) => item.origin === 'generated')) {
    const root = boundaryRoot(boundary);
    const paths = (boundary.files ?? []).map((file) => file.path);
    const inside = (target) => (root ? under(target, root) : paths.some((path) => under(path, target)));
    const writers = [...new Set(written.filter((place) => inside(place.target)).flatMap((place) => place.writers))].sort(cmp);
    claimed.push(inside);
    items.push({ place: boundaryPlace(boundary), shown: shownPlace(ctx, boundary), writers });
  }
  for (const place of written) {
    if (claimed.some((inside) => inside(place.target))) continue;
    const target = ctx.place(place.target);
    items.push({ place: target, shown: target, writers: place.writers });
  }
  return items
    .sort((a, b) => cmp(a.place, b.place))
    .map((item) => ({ ...item, writers: collapse(ctx, item.writers.map((path) => ({ path, text: path }))) }));
}

function generatedSection(ctx, items) {
  const body = items.length > 0
    ? items.map((item) => (item.writers.length > 0
      ? `- **${item.shown}** is written by ${list(worded(item.writers, ctx.shown))}.`
      : `- **${item.shown}** is written by code this map cannot name.`)).join('\n')
    : 'Nothing in this repository writes to a tracked place this map can see.';
  return ['## Generated, never hand-edited', body].join('\n\n');
}

function authored(ctx) {
  return ctx.boundaries
    .filter((boundary) => boundary.origin === 'authored' && (boundary.role === 'config' || boundary.role === 'docs'))
    .sort((a, b) => cmp(boundaryPlace(a), boundaryPlace(b)));
}

function authoredSection(ctx, boundaries) {
  const body = boundaries.length > 0
    ? `People write ${list(boundaries.map((boundary) => shownPlace(ctx, boundary)))}. Nothing in this repository writes to them.`
    : 'No configuration or documentation part is left to people alone.';
  return ['## Hand-authored', body].join('\n\n');
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

// The structure records reach per part, so the chain is walked at part grain:
// the run in the part the door reaches most files of, then at each depth the
// widest part imported by the part before it, named by the first file the
// walk imports in it. A package index that only hands a name on is followed
// to the file the entry's call reaches through it, since that is where the
// work is. The part's entry point is named only when no import into it was
// recorded. The reader is the first one outside the door's own reach, so the
// chain ends at whoever uses the result rather than whoever makes it.
function startHere(ctx, main, groups) {
  const chain = [main.file];
  const byName = new Map(ctx.boundaries.map((boundary) => [boundary.name, boundary]));
  const depthZero = (main.reach ?? []).filter((entry) => entry.depth === 0);
  const paths = runPaths(main);
  const filesIn = (path) => depthZero.find((entry) => entry.boundary === ctx.boundaryOf.get(path))?.files ?? 0;
  const first = [...paths].sort((a, b) => filesIn(b) - filesIn(a) || cmp(a, b))[0];
  if (first) chain.push(first);
  const from = importers(ctx);
  const words = new Map();
  let previous = first ? ctx.boundaryOf.get(first) : null;
  let previousFile = first ?? null;
  for (const level of deeper(main)) {
    const linked = level.entries.filter((entry) => previous && from.get(entry.boundary)?.has(previous));
    const pool = linked.length > 0 ? linked : level.entries;
    const widest = [...pool].sort((a, b) => b.files - a.files || cmp(a.boundary, b.boundary))[0];
    const boundary = byName.get(widest.boundary);
    const place = boundary ? boundaryPlace(boundary) : null;
    const entered = widest.enters?.file ?? null;
    const file = entered ?? entryFile(boundary) ?? place;
    if (file && !chain.includes(file)) {
      chain.push(file);
      if (file === place) words.set(file, shownPlace(ctx, boundary));
    }
    let reached = file === place ? null : file;
    if (entered && isIndex(entered) && previousFile) {
      const through = firstCallInto(ctx, previousFile, widest.boundary);
      if (through && !chain.includes(through)) {
        chain.push(through);
        reached = through;
      }
    }
    previous = widest.boundary;
    previousFile = reached;
  }
  const landing = groups.find((group) => group.files.length > 0);
  if (landing) {
    chain.push(landing.target);
    const reached = new Set((main.reach ?? []).map((entry) => entry.boundary));
    const reader = [...landing.files].sort((a, b) => (
      Number(reached.has(ctx.boundaryOf.get(a.path))) - Number(reached.has(ctx.boundaryOf.get(b.path)))
      || Number(a.text) - Number(b.text)
      || cmp(a.path, b.path)
    ))[0];
    if (reader) chain.push(reader.path);
  }
  return { chain, words: chain.map((step) => words.get(step) ?? step) };
}

function startSection(words, main) {
  if (!main) return ['## Where to start', 'No door was found, so there is no path through this repository to follow.'].join('\n\n');
  return ['## Where to start', words.join(' → '), `Read those in order to follow one ${triggerNoun(main)} end to end.`].join('\n\n');
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

function limits(ctx, shownText) {
  const lines = [];
  const externals = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.externals ?? 0), 0);
  const names = [...new Set(ctx.boundaries.flatMap((boundary) => boundary.externalNames ?? []))].sort(cmp);
  const declared = externalsLine(externals, names);
  if (declared) lines.push(declared);
  const unresolved = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.unresolvedSites ?? 0), 0);
  if (unresolved > 0) lines.push(`${count(unresolved, 'import site')} could not be resolved.`);
  const dynamicWrites = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.dynamicWrites ?? 0), 0);
  const dynamicReads = ctx.boundaries.reduce((sum, boundary) => sum + (boundary.dynamicReads ?? 0), 0);
  if (dynamicWrites + dynamicReads > 0) {
    lines.push(`${count(dynamicWrites, 'write')} and ${count(dynamicReads, 'read')} use paths built at run time and are not named here.`);
  }
  if (shownText) lines.push('Readers marked (found by text) come from scanning unparsed files.');
  const confidence = ctx.statistics.confidence;
  if (confidence?.level === 'low') {
    const reason = String(confidence.reason ?? '').trim().replace(/\.$/, '');
    lines.push(reason ? `Statistics confidence is low: ${reason}.` : 'Statistics confidence is low.');
  }
  return lines;
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

function derivedLine(ctx, main) {
  const parts = count(ctx.boundaries.length, 'part');
  if (ctx.doors.length === 0) return `${parts}. No workflows were found, so this page has no doors.`;
  const doors = count(ctx.doors.length, 'door');
  if (!main) return `${parts}. Work enters through ${doors}, and none of their workflows could be read.`;
  const reach = count(reachSize(main), 'part');
  return `${parts}. Work enters through ${doors}; the busiest is ${main.name}, which reaches ${reach}.`;
}

function doorData(ctx, door) {
  if (door.parseError) return { file: door.file, name: door.name, parseError: true };
  return {
    file: door.file,
    landings: writes(ctx, door),
    name: door.name,
    pushes: door.pushes === true,
    reach: (door.reach ?? []).map((entry) => ({ boundary: entry.boundary, depth: entry.depth, files: entry.files })),
    runs: runPaths(door),
    sends: sendPhrases(door),
    stages: [...(door.stages ?? [])],
    triggers: triggerPhrases(door),
  };
}

/**
 * @param {{ structure: object, statistics: object, document: object, repoName: string, changes?: object }} input
 *   changes is the delta from the map committed at HEAD (adapter/changes.js);
 *   without it the page has no "What changed since …" section
 * @returns {{ markdown: string, json: string }}
 */
export function buildPage({ structure, statistics, document, repoName, changes = null }) {
  const ctx = facts({ structure, statistics: statistics ?? {} });
  const commit = String(statistics?.generatedFrom?.commit ?? structure.generatedFrom?.commit ?? '');
  const generatedAt = String(statistics?.generatedAt ?? '');
  const name = String(repoName ?? '').split('/').pop() || 'this repository';
  const summary = summaryOf(document);
  const main = ctx.doors.find((door) => !door.parseError) ?? null;
  const groups = main ? readerGroups(ctx, main) : [];
  const breakEntries = breaks(ctx);
  const { pairs, withTests } = together(ctx);
  const pairNote = togetherNote(ctx, pairs, withTests);
  const untestedParts = untested(ctx);
  const unreadPlaces = unread(ctx);
  const duplicated = duplicates(ctx);
  const generatedItems = generated(ctx);
  const authoredBoundaries = authored(ctx);
  const start = main ? startHere(ctx, main, groups) : { chain: [], words: [] };
  const found = main ? sequences(ctx, main) : [];
  const shownText = groups.some((group) => group.readers.some((reader) => reader.text?.endsWith(' (found by text)')));
  const limitLines = limits(ctx, shownText);

  const whatThisIs = ['## What this is'];
  if (summary) whatThisIs.push(`${summary} (written by a person)`);
  whatThisIs.push(derivedLine(ctx, main));

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
    authoredSection(ctx, authoredBoundaries),
    startSection(start.words, main),
    limitsSection(limitLines),
  );
  const markdown = `${sections.join('\n\n')}\n`;

  const data = {
    authored: authoredBoundaries.map(boundaryPlace),
    breaks: breakEntries,
    ...(changes ? { changes } : {}),
    changesTogether: pairs,
    changesTogetherNote: pairNote,
    changesTogetherWithTests: withTests,
    commit,
    doors: ctx.doors.map((door) => doorData(ctx, door)),
    duplicates: duplicated.items,
    duplicatesLead: duplicated.lead,
    duplicatesNote: duplicated.note,
    generated: generatedItems.map((item) => ({ place: item.place, writers: worded(item.writers, id) })),
    generatedAt,
    limits: limitLines,
    mainDoor: main ? main.file : null,
    parts: ctx.boundaries.length,
    readers: groups.map((group) => ({ readers: worded(group.readers, id), target: group.target })),
    repo: String(repoName ?? ''),
    sequences: found,
    startHere: start.chain,
    summary,
    summaryFrom: summary ? 'person' : null,
    testedBy: untestedParts.testedBy,
    testFiles: untestedParts.testFiles,
    unread: unreadPlaces.items.map((item) => ({ place: item.place, writers: worded(item.writers, id) })),
    unreadNote: unreadPlaces.note,
    written: unreadPlaces.written,
    untested: untestedParts.items,
    untestedNote: untestedParts.note,
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
