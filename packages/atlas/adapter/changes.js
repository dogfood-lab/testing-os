import { unassignedDrift } from './check.js';
import { capitalize, count, displayName, doorKey, installed, leadName, list, mainDoor, runsShown, siteCount, triggerPhrases, words } from './page.js';

/**
 * What changed since the last committed map, as structural facts in fixed
 * sentences, most significant first.
 *
 * The kinds run in the order of their consequence for a returning reader: a
 * new import that lies on a dependency cycle (components on a cycle are the
 * defect-prone ones, so it is always shown), other new imports, removed
 * imports, doors, places gaining a writer or reader, origin flips, the order
 * of work, parts, and new files no part claims. The counts line is last. Each
 * kind keeps three items and the section twelve, cut after ordering so the top
 * kinds survive; what is cut is counted, never dropped silently.
 */

const PER_KIND = 3;
const TOTAL = 12;

const KINDS = ['cycle', 'import-added', 'import-removed', 'door', 'landing', 'origin', 'sequence', 'part', 'unassigned'];

const MORE = {
  'import-added': ['new import between parts', 'new imports between parts'],
  'import-removed': ['removed import between parts', 'removed imports between parts'],
  door: ['change to a door', 'changes to doors'],
  landing: ['new writer or reader of a place', 'new writers and readers of places'],
  origin: ['origin change', 'origin changes'],
  sequence: ['change to the order of work', 'changes to the order of work'],
  part: ['change to the parts', 'changes to the parts'],
  unassigned: ['new file that belongs to no part', 'new files that belong to no part'],
};

const TRIGGER_WORD = {
  pull_request: 'pull request',
  pull_request_target: 'pull request',
  repository_dispatch: 'dispatch',
  workflow_run: 'workflow run',
  workflow_dispatch: 'manual',
};

function cmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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

function same(left, right) {
  return JSON.stringify(sortKeys(left)) === JSON.stringify(sortKeys(right));
}

function code(value) {
  return `\`${value}\``;
}

function names(previous, current) {
  const shown = new Map();
  for (const side of [previous, current]) {
    const sites = siteCount(side.boundaries ?? []);
    for (const boundary of side.boundaries ?? []) shown.set(boundary.name, displayName(boundary, { sites }));
  }
  return (name) => shown.get(name) ?? name;
}

function allFiles(structure) {
  return [
    ...(structure.boundaries ?? []).flatMap((boundary) => (boundary.files ?? []).map((file) => ({ file, part: boundary.name }))),
    ...(structure.unassigned ?? []).map((file) => ({ file, part: null })),
    ...(structure.overlaps ?? []).map((file) => ({ file, part: null })),
  ];
}

/* ---------- imports between parts ---------- */

function partEdges(structure) {
  const edges = new Set();
  for (const edge of structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from !== edge.to) edges.add(`${edge.from}\0${edge.to}`);
  }
  return edges;
}

function adjacency(edges) {
  const next = new Map();
  for (const key of edges) {
    const [from, to] = key.split('\0');
    if (!next.has(from)) next.set(from, []);
    next.get(from).push(to);
  }
  for (const targets of next.values()) targets.sort(cmp);
  return next;
}

// The shortest path from start to goal, neighbours taken in name order, so
// the cycle a sentence states is the same one on every run.
function shortestPath(next, start, goal) {
  const parent = new Map([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === goal) break;
    for (const to of next.get(node) ?? []) {
      if (parent.has(to)) continue;
      parent.set(to, node);
      queue.push(to);
    }
  }
  if (!parent.has(goal)) return null;
  const path = [];
  for (let node = goal; node != null; node = parent.get(node)) path.unshift(node);
  return path;
}

function importItems(previous, current, shown) {
  const before = partEdges(previous);
  const after = partEdges(current);
  const nextAfter = adjacency(after);
  const nextBefore = adjacency(before);
  const items = [];
  for (const key of [...after].sort(cmp)) {
    if (before.has(key)) continue;
    const [from, to] = key.split('\0');
    const back = shortestPath(nextAfter, to, from);
    if (back) {
      const cycle = [from, ...back];
      // Two parts already in one strongly connected group were on a cycle
      // before this import; it adds a route, it does not create the loop.
      const joined = shortestPath(nextBefore, from, to) && shortestPath(nextBefore, to, from);
      const verb = joined ? 'extends' : 'closes';
      items.push({
        kind: 'cycle',
        sentence: `${shown(from)} now imports ${shown(to)}, which ${verb} the cycle ${cycle.map(shown).join(' → ')}.`,
        subjects: cycle.slice(0, -1),
      });
    } else {
      items.push({ kind: 'import-added', sentence: `${shown(from)} now imports ${shown(to)}.`, subjects: [from, to] });
    }
  }
  for (const key of [...before].sort(cmp)) {
    if (after.has(key)) continue;
    const [from, to] = key.split('\0');
    items.push({ kind: 'import-removed', sentence: `${shown(from)} no longer imports ${shown(to)}.`, subjects: [from, to] });
  }
  return items;
}

/* ---------- doors ---------- */

function startsPhrase(door) {
  const phrases = triggerPhrases(door);
  return phrases.length > 0 ? phrases.join('; ') : 'on nothing this map can read';
}

function runPaths(door) {
  return [...new Set((door.runs ?? []).map((run) => run.path))].sort(cmp);
}

// A path any of the door's tools runs is run; one only a linter or a
// type-checker reads is checked. An artifact written before runs carried a
// kind ran everything it listed.
function checkedOnly(door, path) {
  const runs = (door.runs ?? []).filter((run) => run.path === path);
  return runs.length > 0 && runs.every((run) => run.runKind === 'checks');
}

// A binary the door builds to ship, and runs nowhere (core/doors.js).
function builtOnly(door, path) {
  const runs = (door.runs ?? []).filter((run) => run.path === path);
  return runs.some((run) => run.built) && runs.every((run) => run.built || run.runKind === 'checks');
}

function runsSentence(door) {
  const paths = runPaths(door);
  const ran = paths.filter((path) => !checkedOnly(door, path) && !builtOnly(door, path));
  const built = paths.filter((path) => builtOnly(door, path));
  const checked = paths.filter((path) => checkedOnly(door, path));
  if (paths.length === 0) return 'It runs no file this map can see.';
  const clauses = [];
  if (ran.length > 0) clauses.push(`It runs ${runsShown(ran)}.`);
  if (built.length > 0) clauses.push(`It builds ${runsShown(built)}.`);
  if (checked.length > 0) clauses.push(`It checks ${runsShown(checked)}.`);
  return clauses.join(' ');
}

// "now also runs X", "now also builds Y" and "now also checks Z", each only
// when it has paths.
function runChangeItems(name, file, door, paths, lead) {
  const items = [];
  const ran = paths.filter((path) => !checkedOnly(door, path) && !builtOnly(door, path));
  const built = paths.filter((path) => builtOnly(door, path));
  const checked = paths.filter((path) => checkedOnly(door, path));
  if (ran.length > 0) items.push({ kind: 'door', sentence: `${name} ${lead} runs ${runsShown(ran)}.`, subjects: [file, ...ran] });
  if (built.length > 0) items.push({ kind: 'door', sentence: `${name} ${lead} builds ${runsShown(built)}.`, subjects: [file, ...built] });
  if (checked.length > 0) items.push({ kind: 'door', sentence: `${name} ${lead} checks ${runsShown(checked)}.`, subjects: [file, ...checked] });
  return items;
}

function triggerValues(trigger) {
  const values = [];
  for (const [field, value] of Object.entries(trigger)) {
    if (field === 'event') continue;
    for (const item of Array.isArray(value) ? value : [value]) values.push(String(item));
  }
  return values.sort(cmp);
}

// A trigger whose event appears once on each side is compared field by field,
// so a path filter that gained one glob reads as that glob. Anything else is
// compared whole: a trigger gained or lost.
function triggerItems(name, file, before, after) {
  const items = [];
  const byEvent = (triggers) => {
    const grouped = new Map();
    for (const trigger of triggers) {
      if (!grouped.has(trigger.event)) grouped.set(trigger.event, []);
      grouped.get(trigger.event).push(trigger);
    }
    return grouped;
  };
  const old = byEvent(before);
  const now = byEvent(after);
  const events = [...new Set([...old.keys(), ...now.keys()])].sort(cmp);
  const gained = [];
  const lost = [];
  for (const event of events) {
    const left = old.get(event) ?? [];
    const right = now.get(event) ?? [];
    if (left.length === 1 && right.length === 1) {
      if (same(left[0], right[0])) continue;
      const was = new Set(triggerValues(left[0]));
      const is = new Set(triggerValues(right[0]));
      const added = [...is].filter((value) => !was.has(value)).map(code);
      const removed = [...was].filter((value) => !is.has(value)).map(code);
      const clauses = [];
      if (added.length > 0) clauses.push(`now also names ${list(added)}`);
      if (removed.length > 0) clauses.push(`no longer names ${list(removed)}`);
      // Values that only moved between fields (paths to paths-ignore) leave
      // nothing to name, but the trigger did change.
      const word = TRIGGER_WORD[event] ?? event;
      const change = clauses.length > 0 ? clauses.join(' and ') : 'changed';
      items.push({ kind: 'door', sentence: `${name}'s ${word} trigger ${change}.`, subjects: [file] });
      continue;
    }
    for (const trigger of right) if (!left.some((other) => same(other, trigger))) gained.push(trigger);
    for (const trigger of left) if (!right.some((other) => same(other, trigger))) lost.push(trigger);
  }
  if (gained.length > 0) items.push({ kind: 'door', sentence: `${name} now also starts ${bare(gained)}.`, subjects: [file] });
  if (lost.length > 0) items.push({ kind: 'door', sentence: `${name} no longer starts ${bare(lost)}.`, subjects: [file] });
  return items;
}

// A by-hand trigger alone is worded "by hand"; with others it is "or by hand",
// which after "also starts" would read as a second alternative.
function bare(triggers) {
  return triggerPhrases({ triggers }).map((phrase) => phrase.replace(/^or by hand$/, 'by hand')).join('; ');
}

// What a door is called when it appears or goes: a workflow is a door, and
// a manifest's entry is the command, the desktop app, the game or the
// package it installs, and an action is one other repositories use.
function doorNoun(door) {
  if (!installed(door)) return 'door';
  if (door.kind === 'action') return 'action other repositories use';
  if (door.app === 'desktop') return 'desktop app';
  if (door.app === 'game') return door.name === 'the Godot project' ? 'Godot project' : 'game';
  return door.kind === 'package' ? 'package' : 'command';
}

function newDoorSentence(door, file) {
  if (door.parseError) return `${door.name} (${file}) is a new door; its workflow could not be read.`;
  if (installed(door)) {
    const paths = runPaths(door);
    const verb = door.kind === 'package' ? 'loads' : door.app === 'game' ? 'starts' : 'runs';
    return `${leadName(door)} (${file}) is a new ${doorNoun(door)}. ${paths.length > 0 ? `It ${verb} ${runsShown(paths)}.` : `It ${verb} no file this map can see.`}`;
  }
  return `${door.name} (${file}) is a new door. It starts ${startsPhrase(door)}. ${runsSentence(door)}`;
}

function doorItems(previous, current) {
  const old = new Map((previous.doors ?? []).map((door) => [doorKey(door), door]));
  const now = new Map((current.doors ?? []).map((door) => [doorKey(door), door]));
  const keys = [...new Set([...old.keys(), ...now.keys()])].sort(cmp);
  const items = [];
  for (const key of keys) {
    const was = old.get(key);
    const is = now.get(key);
    const file = (is ?? was).file;
    if (!was) {
      items.push({ kind: 'door', sentence: newDoorSentence(is, file), subjects: [file, ...(is.parseError ? [] : runPaths(is))] });
      continue;
    }
    if (!is) {
      items.push({ kind: 'door', sentence: `${was.name} (${file}) is no longer a ${doorNoun(was)}.`, subjects: [file] });
      continue;
    }
    if (is.parseError || was.parseError) {
      if (is.parseError && !was.parseError) items.push({ kind: 'door', sentence: `${is.name} (${file}) can no longer be read.`, subjects: [file] });
      if (was.parseError && !is.parseError) {
        items.push({ kind: 'door', sentence: `${is.name} (${file}) can be read again. It starts ${startsPhrase(is)}. ${runsSentence(is)}`, subjects: [file] });
      }
      continue;
    }
    items.push(...triggerItems(is.name, file, was.triggers ?? [], is.triggers ?? []));
    if (sampled(was) || sampled(is)) {
      items.push(...cappedRunItems(is.name, file, was, is));
      continue;
    }
    const before = new Set(runPaths(was));
    const after = runPaths(is);
    const added = after.filter((path) => !before.has(path));
    const removed = [...before].filter((path) => !after.includes(path));
    items.push(...runChangeItems(is.name, file, is, added, 'now also'));
    items.push(...runChangeItems(is.name, file, was, removed, 'no longer'));
  }
  return items;
}

// A door whose runs hit the recorded cap keeps a sample, one file per
// directory in turn, so the files in the sample shift whenever a file is
// added anywhere. Comparing samples would report files gained and lost that
// were never touched.
function sampled(door) {
  return (door.runsCount ?? 0) > runPaths(door).length;
}

function runDirectory(path) {
  if (path.endsWith('/')) return path;
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash + 1);
}

function directoryShown(dir) {
  return dir === '' ? 'the repository root' : dir;
}

// Every directory a door runs keeps a file in the sample, so the directories
// and the true count are what a capped door can be compared on.
function cappedRunItems(name, file, was, is) {
  const before = new Set(runPaths(was).map(runDirectory));
  const after = [...new Set(runPaths(is).map(runDirectory))];
  const added = after.filter((dir) => !before.has(dir)).sort(cmp);
  const removed = [...before].filter((dir) => !after.includes(dir)).sort(cmp);
  const items = [];
  if (added.length > 0) {
    items.push({ kind: 'door', sentence: `${name} now also runs files in ${runsShown(added.map(directoryShown))}.`, subjects: [file, ...added.filter(Boolean)] });
  }
  if (removed.length > 0) {
    items.push({ kind: 'door', sentence: `${name} no longer runs files in ${runsShown(removed.map(directoryShown))}.`, subjects: [file, ...removed.filter(Boolean)] });
  }
  const change = (is.runsCount ?? runPaths(is).length) - (was.runsCount ?? runPaths(was).length);
  if (change !== 0) {
    const n = Math.abs(change);
    items.push({ kind: 'door', sentence: `${name} runs ${n} ${change > 0 ? 'more' : 'fewer'} ${n === 1 ? 'file' : 'files'} than before.`, subjects: [file] });
  }
  return items;
}

/* ---------- landing places ---------- */

// A weak entry is a bare file name under a root the engine could not read; the
// page states nothing from it, and neither does this section.
function strongBy(entries) {
  return new Set((entries ?? []).filter((entry) => entry.confidence !== 'weak').map((entry) => entry.by));
}

function landingItems(previous, current) {
  const tracked = allFiles(current).map((entry) => entry.file.path);
  const place = (target) => (tracked.some((path) => path.startsWith(`${target}/`)) ? `${target}/` : target);
  const old = new Map((previous.landings ?? []).map((landing) => [landing.target, landing]));
  const writers = [];
  const readers = [];
  for (const landing of [...(current.landings ?? [])].sort((a, b) => cmp(a.target, b.target))) {
    const was = old.get(landing.target);
    const oldWriters = strongBy(was?.writers);
    const oldReaders = strongBy(was?.readers);
    const newWriters = [...strongBy(landing.writers)].filter((by) => !oldWriters.has(by)).sort(cmp);
    const newReaders = [...strongBy(landing.readers)].filter((by) => !oldReaders.has(by)).sort(cmp);
    const shown = place(landing.target);
    if (newWriters.length > 0) {
      const also = oldWriters.size > 0 ? 'now also' : 'now';
      writers.push({ kind: 'landing', sentence: `${shown} is ${also} written by ${list(newWriters)}.`, subjects: [shown, ...newWriters] });
    }
    if (newReaders.length > 0) {
      const also = oldReaders.size > 0 ? 'now also' : 'now';
      readers.push({ kind: 'landing', sentence: `${shown} is ${also} read by ${list(newReaders)}.`, subjects: [shown, ...newReaders] });
    }
  }
  return [...writers, ...readers];
}

/* ---------- origins ---------- */

function originItems(previous, current, shown) {
  const old = new Map((previous.boundaries ?? []).map((boundary) => [boundary.name, boundary]));
  const items = [];
  for (const boundary of [...(current.boundaries ?? [])].sort((a, b) => cmp(a.name, b.name))) {
    const was = old.get(boundary.name);
    if (!was || was.origin == null || boundary.origin == null || was.origin === boundary.origin) continue;
    items.push({
      kind: 'origin',
      sentence: `${shown(boundary.name)} was ${was.origin} and is now ${boundary.origin}.`,
      subjects: [boundary.name],
    });
  }
  return items;
}

/* ---------- the order of work ---------- */

function stepNames(calls) {
  return (calls ?? []).filter((call) => !call.passed).map((call) => call.name);
}

// Longest common subsequence, so a step inserted in the middle is one step
// gained rather than every later step shifted.
function stepDiff(before, after) {
  const table = Array.from({ length: before.length + 1 }, () => new Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const gained = [];
  const lost = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      i += 1;
      j += 1;
    } else if (j < after.length && (i === before.length || table[i][j + 1] >= table[i + 1][j])) {
      gained.push(j);
      j += 1;
    } else {
      lost.push(i);
      i += 1;
    }
  }
  return { gained, lost };
}

function stepItems(file, subject, before, after) {
  const { gained, lost } = stepDiff(before, after);
  const items = [];
  for (const index of gained) {
    let anchor = '';
    if (index + 1 < after.length) anchor = `, before ${words(after[index + 1])}`;
    else if (index > 0) anchor = `, after ${words(after[index - 1])}`;
    items.push({ kind: 'sequence', sentence: `In ${file}, ${words(subject)} gained a step, ${words(after[index])}${anchor}.`, subjects: [file] });
  }
  for (const index of lost) {
    items.push({ kind: 'sequence', sentence: `In ${file}, ${words(subject)} lost a step, ${words(before[index])}.`, subjects: [file] });
  }
  return items;
}

function entrySequence(file) {
  return (file?.sequences ?? []).find((sequence) => sequence.name === file.entry) ?? null;
}

function sequenceItems(previous, current) {
  const main = mainDoor(current.doors ?? []);
  if (!main) return [];
  const oldFiles = new Map(allFiles(previous).map((entry) => [entry.file.path, entry.file]));
  const newFiles = new Map(allFiles(current).map((entry) => [entry.file.path, entry.file]));
  const items = [];
  for (const path of runPaths(main)) {
    const was = oldFiles.get(path);
    const is = newFiles.get(path);
    if (was?.entry == null || is?.entry == null) continue;
    if (was.entry !== is.entry) {
      items.push({ kind: 'sequence', sentence: `${path} now starts at ${words(is.entry)}; it started at ${words(was.entry)}.`, subjects: [path] });
      continue;
    }
    const oldRoot = entrySequence(was);
    const newRoot = entrySequence(is);
    if (!oldRoot || !newRoot) continue;
    items.push(...stepItems(path, is.entry, stepNames(oldRoot.calls), stepNames(newRoot.calls)));
    for (const call of newRoot.calls) {
      if (call.passed || !call.inner) continue;
      const target = call.target?.file ?? null;
      const prior = oldRoot.calls.find((other) => !other.passed && other.inner && other.name === call.name && (other.target?.file ?? null) === target);
      if (!prior) continue;
      items.push(...stepItems(target ?? path, call.name, stepNames(prior.inner), stepNames(call.inner)));
    }
  }
  return items;
}

/* ---------- parts ---------- */

function partItems(previous, current, shown) {
  const old = new Map((previous.boundaries ?? []).map((boundary) => [boundary.name, boundary]));
  const now = new Map((current.boundaries ?? []).map((boundary) => [boundary.name, boundary]));
  const gone = [...old.values()].filter((boundary) => !now.has(boundary.name)).sort((a, b) => cmp(a.name, b.name));
  const fresh = [...now.values()].filter((boundary) => !old.has(boundary.name)).sort((a, b) => cmp(a.name, b.name));
  const fileSet = (boundary) => (boundary.files ?? []).map((file) => file.path).sort(cmp).join('\0');
  const globSet = (boundary) => [...(boundary.globs ?? [])].sort(cmp).join('\0');
  const items = [];
  const renamed = new Set();
  for (const was of gone) {
    const is = fresh.find((candidate) => !renamed.has(candidate.name) && (
      globSet(candidate) === globSet(was) || (fileSet(was) !== '' && fileSet(candidate) === fileSet(was))
    ));
    if (!is) continue;
    renamed.add(was.name);
    renamed.add(is.name);
    items.push({ kind: 'part', sentence: `${shown(was.name)} is now called ${shown(is.name)}.`, subjects: [was.name, is.name] });
  }
  for (const is of fresh) {
    if (renamed.has(is.name)) continue;
    const globs = (is.globs ?? []).map(code);
    const drawn = globs.length > 0 ? `, drawn from ${list(globs)}` : '';
    items.push({ kind: 'part', sentence: `${shown(is.name)} is a new part${drawn}.`, subjects: [is.name] });
  }
  for (const was of gone) {
    if (renamed.has(was.name)) continue;
    items.push({ kind: 'part', sentence: `${shown(was.name)} is no longer a part.`, subjects: [was.name] });
  }
  return items;
}

/* ---------- files no part claims ---------- */

// The same rule the check applies, so this section never calls a file new
// that the check would pardon as a rename, or the other way round.
function unassignedItems(previous, current, repoPath) {
  if (repoPath == null) return [];
  const failure = unassignedDrift({ unassigned: previous.unassigned ?? [] }, { unassigned: current.unassigned ?? [] }, repoPath);
  return (failure?.details ?? []).map((path) => ({
    kind: 'unassigned',
    sentence: `${path} is new and belongs to no part, so atlas check fails on it against the previous map.`,
    subjects: [path],
  }));
}

/* ---------- counts ---------- */

/**
 * Files added, removed, moved and changed in content, and how many parts they
 * touch. A file is moved when its path now sits in another part, or when a
 * removed path and an added path carry the same bytes.
 */
export function fileCounts(previous, current) {
  const old = new Map(allFiles(previous).map((entry) => [entry.file.path, entry]));
  const now = new Map(allFiles(current).map((entry) => [entry.file.path, entry]));
  const parts = new Set();
  const touch = (entry) => {
    if (entry.part != null) parts.add(entry.part);
  };
  let changed = 0;
  let moved = 0;
  const added = [];
  const removed = [];
  for (const [path, entry] of now) {
    const was = old.get(path);
    if (!was) {
      added.push(entry);
      continue;
    }
    if (was.part !== entry.part) {
      moved += 1;
      touch(was);
      touch(entry);
    } else if (was.file.hash !== entry.file.hash) {
      changed += 1;
      touch(entry);
    }
  }
  for (const [path, entry] of old) if (!now.has(path)) removed.push(entry);
  const byPath = (a, b) => cmp(a.file.path, b.file.path);
  added.sort(byPath);
  removed.sort(byPath);
  const unmatched = [];
  for (const entry of added) {
    const index = removed.findIndex((gone) => gone.file.hash === entry.file.hash);
    if (index === -1) {
      unmatched.push(entry);
      continue;
    }
    moved += 1;
    touch(removed[index]);
    touch(entry);
    removed.splice(index, 1);
  }
  for (const entry of [...unmatched, ...removed]) touch(entry);
  return { added: unmatched.length, changed, moved, parts: parts.size, removed: removed.length };
}

function countsClause(counts) {
  const terms = [
    [counts.added, 'added'],
    [counts.removed, 'removed'],
    [counts.moved, 'moved'],
    [counts.changed, 'changed content'],
  ].filter(([n]) => n > 0);
  if (terms.length === 0) return 'no file changed';
  return list(terms.map(([n, verb], index) => (index === 0 ? `${count(n, 'file')} ${verb}` : `${n} ${verb}`)));
}

function countsSentence(counts) {
  const clause = capitalize(countsClause(counts));
  return counts.parts > 0 ? `${clause}, across ${count(counts.parts, 'part')}.` : `${clause}.`;
}

/* ---------- ordering and caps ---------- */

function capped(items) {
  const byKind = new Map(KINDS.map((kind) => [kind, []]));
  for (const item of items) byKind.get(item.kind).push(item);
  const kept = [];
  const cut = new Map();
  let total = 0;
  for (const kind of KINDS) {
    const members = byKind.get(kind);
    members.forEach((item, index) => {
      // A new import on a cycle is never cut: it is the one fact a returning
      // reader must not miss, and it still counts toward the total.
      if (kind === 'cycle' || (index < PER_KIND && total < TOTAL)) {
        kept.push(item);
        total += 1;
      } else {
        cut.set(kind, (cut.get(kind) ?? 0) + 1);
      }
    });
    const more = cut.get(kind);
    if (more) {
      const [one, many] = MORE[kind];
      kept.push({ kind, sentence: `And ${more} more ${more === 1 ? one : many}.`, subjects: [] });
    }
  }
  return kept;
}

function when(since) {
  const date = String(since?.generatedAt ?? '').slice(0, 10);
  if (date) return date;
  const commit = String(since?.commit ?? '').slice(0, 7);
  return commit ? `commit ${commit}` : 'the last map';
}

/**
 * Every structural change between two structures, in the order of KINDS and,
 * within a kind, as each kind orders its own; nothing is cut. The page and
 * atlas diff cap this list; the sidecar pages through it.
 *
 * @param {object} previous
 * @param {object} current
 * @param {{ repoPath?: string|null }} [options]
 * @returns {Array<{ kind: string, sentence: string, subjects: string[] }>}
 */
export function structuralChanges(previous, current, { repoPath = null } = {}) {
  const shown = names(previous, current);
  return [
    ...importItems(previous, current, shown),
    ...doorItems(previous, current),
    ...landingItems(previous, current),
    ...originItems(previous, current, shown),
    ...sequenceItems(previous, current),
    ...partItems(previous, current, shown),
    ...unassignedItems(previous, current, repoPath),
  ];
}

/**
 * @param {object} previous the structure committed at HEAD
 * @param {object} current the structure just derived
 * @param {{ repoPath?: string, since?: { commit?: string, generatedAt?: string } }} [options]
 *   repoPath lets the new-unassigned rule read file sizes the way the check does
 * @returns {{ items: Array<{ kind: string, sentence: string, subjects: string[] }>, fileCounts: object, unchanged: boolean }}
 */
export function compareStructures(previous, current, { repoPath = null, since = null } = {}) {
  const structural = structuralChanges(previous, current, { repoPath });
  const counts = fileCounts(previous, current);
  if (structural.length === 0) {
    return {
      items: [{ kind: 'counts', sentence: `Nothing structural changed since ${when(since)}; ${countsClause(counts)}.`, subjects: [] }],
      fileCounts: counts,
      unchanged: true,
    };
  }
  return {
    items: [...capped(structural), { kind: 'counts', sentence: countsSentence(counts), subjects: [] }],
    fileCounts: counts,
    unchanged: false,
  };
}

/**
 * The page's `changes` object: the delta from the map committed at HEAD, or
 * `{ first: true }` when HEAD carries none.
 *
 * @param {{ structure: object, statistics?: object } | null} committed
 * @param {object} current
 * @param {{ repoPath?: string }} [options]
 */
export function changesSince(committed, current, { repoPath = null } = {}) {
  if (!committed?.structure) return { first: true };
  const since = {
    commit: String(committed.statistics?.generatedFrom?.commit ?? committed.structure.generatedFrom?.commit ?? ''),
    generatedAt: committed.statistics?.generatedAt ?? null,
  };
  const compared = compareStructures(committed.structure, current, { repoPath, since });
  return { fileCounts: compared.fileCounts, items: compared.items, since, unchanged: compared.unchanged };
}
