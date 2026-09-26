import { isTestFile } from '../core/landings.js';
import { basisOf, byBasis, group } from './answer.js';
import { cannotSeeSentence, walkStopsAt } from './limits.js';

/**
 * atlas_reach: what a change to these files reaches. The walk starts at the
 * files asked about and follows two kinds of edge back from a file to what
 * depends on it:
 *
 * - an import: every file that imports it (parsed);
 * - a place: what the file writes, to every file that reads that place,
 *   known as firmly as the weaker of the write and the read.
 *
 * It follows parsed and declared edges as far as they go. A text, weak or
 * history fact is listed one step out and never followed, so a guess cannot
 * carry the walk further than the map knows. Unresolved and outside entries
 * are listed where the walk stops, so the asker sees where the map ends.
 * The doors that run a file the walk reaches, or pass through the part of a
 * file asked about, are listed first; production files before tests.
 */

const FIRMNESS = ['parsed', 'declared', 'text', 'weak'];
const FOLLOWED = new Set(['parsed', 'declared']);

function under(path, place) {
  return path === place || path.startsWith(`${place}/`);
}

function weaker(a, b) {
  return FIRMNESS.indexOf(a) >= FIRMNESS.indexOf(b) ? a : b;
}

function stripSlash(path) {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

// A door's run of a directory stands for the files under it.
function runsFile(run, path) {
  return run.path === path || (run.path.endsWith('/') && path.startsWith(run.path));
}

/**
 * The files a path stands for: itself when the map holds it as a file, the
 * files under it when it is a directory; null when the map holds neither.
 */
function filesFor(ctx, path) {
  const clean = stripSlash(String(path).replaceAll('\\', '/')).replace(/^(\.\/)+/, '');
  if (ctx.fileOf.has(clean)) return [clean];
  const members = [...ctx.fileOf.keys()].filter((file) => file.startsWith(`${clean}/`)).sort();
  return members.length > 0 ? members : null;
}

/**
 * @param {object} snapshot from sidecar/map.js
 * @param {string[]} paths the files or directories asked about, from the repository root
 * @returns {{ ok: false, error: object } | { ok: true, answer: object, sentences: string[], files: string[] }}
 */
export function reachAnswer(snapshot, paths) {
  const ctx = snapshot.ctx;
  const { structure } = snapshot;
  const asked = new Set();
  const unknown = [];
  for (const path of paths) {
    const files = filesFor(ctx, path);
    if (files) for (const file of files) asked.add(file);
    else unknown.push(path);
  }
  if (unknown.length > 0) {
    return { ok: false, error: { code: 'ATLAS_EXPLAIN_UNKNOWN_PATH', details: unknown.slice(0, 8).map((path) => `${path} names no file or directory in the map`), whatToDo: 'check the paths, or run atlas map if the files are new' } };
  }

  const importers = new Map();
  for (const [path, file] of ctx.fileOf) {
    for (const target of file.importsFiles ?? []) {
      if (!importers.has(target)) importers.set(target, []);
      importers.get(target).push(path);
    }
  }
  const landings = (structure.landings ?? []).filter((landing) => !landing.spans);
  // What each file writes, and what lies inside each place written, found once.
  const writesBy = new Map();
  for (const landing of landings) {
    if (landing.tracked === false) continue;
    for (const writer of landing.writers ?? []) {
      if (!writesBy.has(writer.by)) writesBy.set(writer.by, []);
      writesBy.get(writer.by).push({ landing, writer });
    }
  }
  const insideOf = new Map();
  const inside = (target) => {
    if (!insideOf.has(target)) insideOf.set(target, landings.filter((landing) => under(landing.target, target)));
    return insideOf.get(target);
  };

  const reached = new Map();
  const oneStep = [];
  const queue = [...asked].sort();
  for (const path of queue) reached.set(path, { depth: 0 });
  for (let at = 0; at < queue.length; at += 1) {
    const path = queue[at];
    const depth = reached.get(path).depth + 1;
    for (const importer of (importers.get(path) ?? []).sort()) {
      if (reached.has(importer)) continue;
      reached.set(importer, { depth, via: path, how: 'imports', basis: 'parsed' });
      queue.push(importer);
    }
    for (const { landing: written, writer } of writesBy.get(path) ?? []) {
      const wrote = basisOf(writer.confidence);
      for (const read of inside(written.target)) {
        for (const reader of read.readers ?? []) {
          if (reader.by === path) continue;
          const basis = weaker(wrote, basisOf(reader.confidence));
          const place = ctx.place(read.target);
          if (!FOLLOWED.has(basis)) {
            oneStep.push({ item: { path: reader.by, place, via: path }, basis, tests: reader.fromTests === true || isTestFile(reader.by) });
            continue;
          }
          if (reached.has(reader.by)) continue;
          reached.set(reader.by, { depth, via: path, how: 'reads', place, basis });
          queue.push(reader.by);
        }
      }
    }
  }

  const facts = [];
  const partOf = (path) => ctx.boundaryOf.get(path) ?? null;
  facts.push(group('asked', 'declared', [...asked].sort().map((path) => ({ path, part: partOf(path) }))));

  // Doors: those that run a file asked about (the workflow says so), those
  // that run a file the walk reached (through an import or a place), and
  // those whose reach passes through the part of a file asked about.
  const readable = ctx.doors.filter((door) => !door.parseError);
  const executes = (run) => run.runKind !== 'checks' && !run.built;
  const runs = [];
  const checks = [];
  const through = [];
  const listedDoors = new Set();
  for (const door of readable) {
    const ran = [...asked].filter((path) => (door.runs ?? []).some((run) => executes(run) && runsFile(run, path)));
    if (ran.length > 0) {
      runs.push(...ran.map((file) => ({ door: door.name, file })));
      listedDoors.add(door.name);
      continue;
    }
    const checked = [...asked].filter((path) => (door.runs ?? []).some((run) => run.runKind === 'checks' && runsFile(run, path)));
    if (checked.length > 0) {
      checks.push(...checked.map((file) => ({ door: door.name, file })));
      listedDoors.add(door.name);
      continue;
    }
    const via = [...reached.entries()].filter(([path, entry]) => entry.depth > 0 && (door.runs ?? []).some((run) => executes(run) && runsFile(run, path)))
      .sort((a, b) => a[1].depth - b[1].depth || (a[0] < b[0] ? -1 : 1));
    if (via.length > 0) {
      through.push({ item: { door: door.name, through: via[0][0] }, basis: 'parsed' });
      listedDoors.add(door.name);
    }
  }
  if (runs.length > 0) facts.push(group('runs', 'declared', runs));
  if (checks.length > 0) facts.push(group('checks', 'declared', checks));
  facts.push(...byBasis('reachedThrough', through));
  const askedParts = new Set([...asked].map(partOf).filter(Boolean));
  const passing = [];
  for (const door of readable) {
    if (listedDoors.has(door.name)) continue;
    for (const entry of door.reach ?? []) {
      if (!askedParts.has(entry.boundary)) continue;
      passing.push({ item: { door: door.name, part: entry.boundary, depth: entry.depth }, basis: entry.depth === 0 ? 'declared' : 'parsed' });
    }
  }
  facts.push(...byBasis('passesThrough', passing, { grain: 'part' }));

  // The files the walk reached, production before tests.
  const found = [...reached.entries()].filter(([, entry]) => entry.depth > 0)
    .sort((a, b) => a[1].depth - b[1].depth || (a[0] < b[0] ? -1 : 1));
  const item = ([path, entry]) => ({ path, via: entry.via, depth: entry.depth, ...(entry.place ? { place: entry.place } : {}) });
  const production = found.filter(([path]) => !isTestFile(path));
  const tests = found.filter(([path]) => isTestFile(path));
  facts.push(...byBasis('importedBy', production.filter(([, entry]) => entry.how === 'imports').map((entry) => ({ item: item(entry), basis: entry[1].basis })), { grain: 'file' }));
  facts.push(...byBasis('readBy', production.filter(([, entry]) => entry.how === 'reads').map((entry) => ({ item: item(entry), basis: entry[1].basis })), { grain: 'file' }));
  facts.push(...byBasis('importedBy', tests.filter(([, entry]) => entry.how === 'imports').map((entry) => ({ item: item(entry), basis: entry[1].basis })), { grain: 'file', tests: true }));
  facts.push(...byBasis('readBy', tests.filter(([, entry]) => entry.how === 'reads').map((entry) => ({ item: item(entry), basis: entry[1].basis })), { grain: 'file', tests: true }));

  const partsReached = (entries) => [...new Set(entries.map(([path]) => partOf(path)).filter(Boolean))].sort();
  const productionParts = partsReached(production);
  const testParts = partsReached(tests);
  if (productionParts.length > 0) facts.push(group('parts', 'parsed', productionParts, { grain: 'part' }));
  if (testParts.length > 0) facts.push(group('parts', 'parsed', testParts, { grain: 'part', tests: true }));

  // Listed one step out, never followed.
  const unfollowed = new Map();
  for (const entry of oneStep) unfollowed.set(`${entry.basis}\0${entry.item.path}\0${entry.item.place}`, entry);
  const stepped = [...unfollowed.values()].sort((a, b) => (a.item.path < b.item.path ? -1 : a.item.path > b.item.path ? 1 : 0));
  facts.push(...byBasis('readBy', stepped.filter((entry) => !entry.tests), { grain: 'file', followed: false }));
  facts.push(...byBasis('readBy', stepped.filter((entry) => entry.tests), { grain: 'file', tests: true, followed: false }));

  // A part that runs files of an asked part as a child process, or loads a
  // built chunk of it, reaches it at part grain: the map records no file.
  const partEdges = (structure.edges ?? []).filter((edge) => (edge.kind === 'spawns' || edge.kind === 'chunk') && askedParts.has(edge.to) && edge.from !== edge.to)
    .map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind, ...(edge.fromTests ? { fromTests: true } : {}) }));
  if (partEdges.length > 0) facts.push(group('partEdges', 'parsed', partEdges, { grain: 'part' }));

  const pairs = (snapshot.statistics?.pairs ?? []).filter((pair) => asked.has(pair.a) || asked.has(pair.b))
    .sort((x, y) => y.strength - x.strength || y.shared - x.shared || (x.a < y.a ? -1 : 1))
    .map((pair) => (asked.has(pair.a)
      ? { file: pair.a, with: pair.b, shared: pair.shared, either: pair.either, strength: pair.strength }
      : { file: pair.b, with: pair.a, shared: pair.shared, either: pair.either, strength: pair.strength }));
  if (pairs.length > 0) {
    const parameters = snapshot.statistics?.parameters ?? {};
    const confidence = snapshot.statistics?.confidence ?? {};
    facts.push(group('changesWith', 'history', pairs, {
      followed: false,
      window: { since: parameters.since ?? null, until: parameters.headDate ?? null },
      confidence: { level: confidence.level ?? null, reason: confidence.reason ?? null },
    }));
  }

  // Where the walk stops: what may depend on these files unseen anywhere in
  // the repository, and where what the reached code writes leaves the map.
  const reachedFiles = [...reached.keys()];
  const reachedParts = [...new Set(reachedFiles.map(partOf).filter(Boolean))];
  const doorsNamed = readable.filter((door) => listedDoors.has(door.name));
  const cannotSee = walkStopsAt(snapshot, { reached: reachedFiles, reachedParts, doors: doorsNamed, askedParts: [...askedParts] });

  const sentences = reachSentences(ctx, { asked, runs, checks, through, passing, production, tests, stepped, pairs, partEdges });
  sentences.push(...cannotSee.map((entry) => cannotSeeSentence(entry, ctx.shown)));
  return {
    ok: true,
    answer: { question: { paths: [...paths] }, facts, cannotSee },
    sentences,
    files: [...asked].sort(),
  };
}

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function count(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// How many files a sentence names before it counts the rest.
const NAMED = 6;

function named(paths) {
  return paths.length <= NAMED ? list(paths) : `${paths.slice(0, NAMED).join(', ')} and ${paths.length - NAMED} more`;
}

function reachSentences(ctx, facts) {
  const out = [];
  const asked = [...facts.asked].sort();
  const subject = asked.length === 1 ? asked[0] : `these ${asked.length} files`;
  for (const entry of facts.runs) out.push(`Atlas: ${entry.door} runs ${entry.file}, as its workflow states.`);
  for (const entry of facts.checks) out.push(`Atlas: ${entry.door} checks ${entry.file}, as its workflow states.`);
  for (const entry of facts.through) out.push(`Atlas: ${subject} ${asked.length === 1 ? 'is' : 'are'} reached from ${entry.item.door} through ${entry.item.through}.`);
  const passing = [...new Set(facts.passing.map((entry) => entry.item.door))];
  if (passing.length > 0) out.push(`Atlas: ${list(passing)} ${passing.length === 1 ? 'passes' : 'pass'} through the part of ${subject}.`);
  const code = facts.production.map(([path]) => path);
  const tests = facts.tests.map(([path]) => path);
  if (code.length > 0) out.push(`Atlas: a change to ${subject} reaches ${count(code.length, 'file')} through imports and places read from the code: ${named(code)}.`);
  else out.push(`Atlas: no file in this repository imports ${subject} or reads what ${asked.length === 1 ? 'it writes' : 'they write'}, as far as the map can follow.`);
  if (tests.length > 0) out.push(`Atlas: it reaches ${count(tests.length, 'test file')}: ${named(tests)}.`);
  for (const entry of facts.stepped) {
    const how = entry.basis === 'text' ? 'found by text' : 'a guess from a bare file name';
    out.push(`Atlas: ${entry.item.path} reads ${entry.item.place}, which ${entry.item.via} writes (${how}); the walk does not go past it.`);
  }
  for (const edge of facts.partEdges) out.push(`Atlas: ${ctx.shown(edge.from)} ${edge.kind === 'spawns' ? 'runs files of' : 'loads a built chunk of'} ${ctx.shown(edge.to)}; the map records the parts, not the files.`);
  for (const pair of facts.pairs.slice(0, 3)) out.push(`Atlas: ${pair.file} changes with ${pair.with} in ${pair.shared} of ${count(pair.either, 'commit')} (history; not followed).`);
  return out;
}
