import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, posix, relative } from 'node:path';
import { isOwnTest, isTestFile } from '../core/landings.js';
import { formatFailure } from './errors.js';
import { boundaryRoot, capitalize, collapse, count, cover, entryOrder, externalsLine, installed, list, pageFacts, readerFiles, readerItem, testsClause, under, worded } from './page.js';

/**
 * atlas explain: what one file, one directory or one part is in the system,
 * read from the committed artifacts alone. It never maps, so it answers from
 * what the repository last committed and says which commit that was.
 */

const LISTED = 6;
const PAIRS_SHOWN = 3;
const NO_ORDER = 'No order of work is recorded; only files a door runs, and the files they call, carry one.';
// How near a written place is to the place explained, nearest first: the
// place itself, a place inside it, then a directory that holds it.
const RELATIONS = ['exact', 'inside', 'parent'];

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

function shownList(items) {
  if (items.length <= LISTED) return list(items);
  return `${items.slice(0, LISTED).join(', ')} and ${items.length - LISTED} more`;
}

function readJson(path) {
  if (!existsSync(path)) return { absent: true };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return { invalid: true };
  }
}

function parseArgs(argv) {
  let json = false;
  let target = null;
  for (const arg of argv) {
    if (arg === '--json') json = true;
    else if (arg.startsWith('--')) return { error: `atlas: unknown argument ${arg}` };
    else if (target != null) return { error: `atlas: explain takes one path, got ${arg} as well` };
    else target = arg;
  }
  if (target == null) return { error: 'atlas: explain needs a path' };
  return { json, target };
}

// A path is tried as the caller wrote it from where they stand, then as a
// path from the repository root, so both `persist.js` inside packages/ingest
// and `packages/ingest/persist.js` anywhere in the tree are understood.
function candidates(repo, prefix, raw) {
  const given = String(raw).replaceAll('\\', '/');
  if (isAbsolute(given)) return [clean(relative(repo, given).replaceAll('\\', '/'))].filter(Boolean);
  const out = [clean(posix.join(prefix, given)), clean(given)];
  return [...new Set(out.filter(Boolean))];
}

function clean(path) {
  const normal = posix.normalize(path).replace(/\/+$/, '');
  if (normal === '.' || normal === '' || normal === '..' || normal.startsWith('../')) return null;
  return normal.replace(/^(\.\/)+/, '');
}

function mapCommit(page, statistics, structure) {
  const commit = String(page?.commit ?? statistics?.generatedFrom?.commit ?? structure.generatedFrom?.commit ?? '');
  const generatedAt = String(page?.generatedAt ?? statistics?.generatedAt ?? '');
  return { commit, generatedAt };
}

// As on the page, an edge whose every import sits in a test file is counted
// apart from the production edges.
function partEdges(ctx) {
  const imports = new Map();
  const importedBy = new Map();
  const importedByTests = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from === edge.to) continue;
    if (edge.fromTests) {
      add(importedByTests, edge.to, edge.from);
      continue;
    }
    add(imports, edge.from, edge.to);
    add(importedBy, edge.to, edge.from);
  }
  const sorted = (map, part) => [...(map.get(part) ?? [])].sort(cmp);
  return {
    imports: (part) => sorted(imports, part),
    importedBy: (part) => sorted(importedBy, part),
    importedByTests: (part) => sorted(importedByTests, part).filter((name) => !importedBy.get(part)?.has(name)),
  };
}

/**
 * One file's imports at file grain, from the per-file lists the artifact
 * carries: what it imports, what it re-exports whole, which files import it,
 * and its own tests by name.
 */
function fileImports(ctx, path) {
  const file = ctx.fileOf.get(path);
  const reexportsAll = [...(file?.reexportsAll ?? [])];
  const whole = new Set(reexportsAll);
  const importsFiles = (file?.importsFiles ?? []).filter((target) => !whole.has(target));
  const tests = [];
  const code = [];
  for (const [other, entry] of ctx.fileOf) {
    if (other === path || !(entry.importsFiles ?? []).includes(path)) continue;
    (isTestFile(other) ? tests : code).push(other);
  }
  const ownTests = [...ctx.fileOf.keys()].filter((other) => isOwnTest(other, path)).sort(cmp);
  return {
    importedByFiles: [...code.sort(cmp), ...tests.sort(cmp)],
    importedByTestFiles: tests.length,
    importsFiles,
    ownTests,
    parseError: file?.parseError === true,
    reexportsAll,
  };
}

// A build chunk has no one file to name, so it is named by its part.
function targetText(ctx, target) {
  return target.startsWith('@') ? `a built chunk of ${ctx.shown(target.slice(1))}` : target;
}

function fileImportLines(ctx, own) {
  const lines = [];
  const shown = (targets) => shownList(targets.map((target) => targetText(ctx, target)));
  if (own.parseError) lines.push('It could not be parsed, so what it imports is not known.');
  else if (own.importsFiles.length > 0) lines.push(`Imports ${count(own.importsFiles.length, 'file')}: ${shown(own.importsFiles)}.`);
  if (own.reexportsAll.length > 0) lines.push(`Re-exports everything from ${shown(own.reexportsAll)}.`);
  if (!own.parseError && own.importsFiles.length + own.reexportsAll.length === 0) lines.push('Imports no file in this repository.');
  const importers = own.importedByFiles.length;
  if (importers === 0) lines.push('No file imports it.');
  else {
    const tests = own.importedByTestFiles;
    const which = tests === 0 ? '' : tests === importers ? `, ${importers === 1 ? 'a test' : 'all of them tests'}` : `, ${tests} of them ${tests === 1 ? 'a test' : 'tests'}`;
    lines.push(`Imported by ${count(importers, 'file')}${which}: ${shownList(own.importedByFiles)}.`);
  }
  if (own.ownTests.length > 0) {
    lines.push(own.ownTests.length === 1 ? `Its own test is ${own.ownTests[0]}.` : `Its own tests are ${list(own.ownTests)}.`);
  }
  return lines;
}

function overlapOf(ctx, path) {
  return (ctx.structure.overlaps ?? []).find((file) => file.path === path) ?? null;
}

// A path is looked for before a part, so a directory and the part drawn from
// it (records/ and records) are explained as the directory, which says the
// part it is in; a part is found by the name the boundary file gives it.
function locate(ctx, tried, raw) {
  for (const path of tried) {
    if (ctx.fileOf.has(path)) return { kind: 'file', path, members: [path] };
  }
  for (const path of tried) {
    const members = [...ctx.fileOf.keys()].filter((file) => file.startsWith(`${path}/`)).sort(cmp);
    if (members.length > 0) return { kind: 'directory', path, members };
  }
  const name = String(raw);
  const boundary = ctx.boundaries.find((item) => item.name === name);
  if (boundary) {
    return { kind: 'part', path: null, part: boundary.name, members: (boundary.files ?? []).map((file) => file.path).sort(cmp) };
  }
  return null;
}

function partsIn(ctx, members) {
  const byPart = new Map();
  let loose = 0;
  for (const path of members) {
    const part = ctx.boundaryOf.get(path);
    if (part == null) {
      loose += 1;
      continue;
    }
    byPart.set(part, (byPart.get(part) ?? 0) + 1);
  }
  const roles = new Map(ctx.boundaries.map((boundary) => [boundary.name, boundary.role]));
  const parts = [...byPart.entries()]
    .sort((a, b) => cmp(a[0], b[0]))
    .map(([part, files]) => ({ files, part, partLabel: ctx.shown(part), role: roles.get(part) ?? null }));
  return { parts, loose };
}

// The door runs a member, or reaches the member's part; a door whose workflow
// could not be read names nothing, so it is left out of both.
function doorFacts(ctx, found, part) {
  const inside = new Set(found.members);
  const readable = ctx.doors.filter((door) => !door.parseError);
  // A directory run stands for the files under it.
  const runs = (run) => inside.has(run.path) || (run.path.endsWith('/') && found.members.some((member) => member.startsWith(run.path)));
  // A door that only lints or type-checks a member reads it and runs nothing,
  // and one that builds it into a binary it ships runs it nowhere.
  const executes = (run) => run.runKind !== 'checks' && !run.built;
  const runBy = readable.filter((door) => (door.runs ?? []).some((run) => executes(run) && runs(run))).map((door) => door.name);
  const builtBy = readable
    .filter((door) => !runBy.includes(door.name) && (door.runs ?? []).some((run) => run.built && runs(run)))
    .map((door) => door.name);
  const checkedBy = readable
    .filter((door) => !runBy.includes(door.name) && !builtBy.includes(door.name) && (door.runs ?? []).some((run) => run.runKind === 'checks' && runs(run)))
    .map((door) => door.name);
  const onPath = part == null
    ? []
    : readable.filter((door) => (door.reach ?? []).some((entry) => entry.boundary === part)).map((door) => door.name);
  // A manifest that installs a command declares a door rather than being one:
  // the command runs the file it names, and that file says so.
  const self = found.kind === 'file' ? ctx.doors.find((door) => !installed(door) && door.file === found.path) ?? null : null;
  return { builtBy, checkedBy, onPath, runBy, self };
}

function doorLine(doors, partLabel, kind) {
  if (doors.self) {
    const { name, parseError } = doors.self;
    return parseError ? `It is the door ${name}, whose workflow could not be read.` : `It is the door ${name}.`;
  }
  // A part is spoken of as a directory is: its files, not it, are run.
  const directory = kind === 'directory' || kind === 'part';
  const built = doors.builtBy ?? [];
  if (doors.runBy.length > 0 || built.length > 0 || doors.checkedBy.length > 0) {
    const clauses = [];
    if (!directory) {
      if (doors.runBy.length > 0) clauses.push(`run by ${list(doors.runBy)}`);
      if (built.length > 0) clauses.push(`built into a binary by ${list(built)}`);
      if (doors.checkedBy.length > 0) clauses.push(`checked by ${list(doors.checkedBy)}`);
    } else {
      if (doors.runBy.length > 0) clauses.push(`${list(doors.runBy)} ${doors.runBy.length === 1 ? 'runs' : 'run'} files in it`);
      if (built.length > 0) clauses.push(`${list(built)} ${built.length === 1 ? 'builds' : 'build'} files in it into a binary`);
      if (doors.checkedBy.length > 0) clauses.push(`${list(doors.checkedBy)} ${doors.checkedBy.length === 1 ? 'checks' : 'check'} files in it`);
    }
    const text = clauses.join('; ');
    return `${text[0].toUpperCase()}${text.slice(1)}.`;
  }
  if (doors.onPath.length > 0) return `On the path of ${list(doors.onPath)} through ${partLabel}.`;
  if (kind === 'part') return 'No door runs a file in it or reaches it.';
  const runs = directory ? 'No door runs a file in it' : 'No door runs it';
  return partLabel == null ? `${runs}.` : `${runs} or reaches its part.`;
}

// The places the members write, with the readers of each. As on the page, a
// workflow naming its own output and a reader inside the place itself are the
// making of the result, not a use of it; the members' own reads are left out.
// A writer of the place's parent directory writes the place too.
function writeFacts(ctx, members) {
  const own = new Set(members);
  const targets = ctx.landings.filter((landing) => landing.writers.some((entry) => own.has(entry.by))).map((landing) => landing.target);
  return cover(targets).map((target) => {
    const inside = ctx.landings.filter((landing) => under(landing.target, target));
    const writers = new Set(ctx.landings
      .filter((landing) => under(landing.target, target) || under(target, landing.target))
      .flatMap((landing) => landing.writers.map((entry) => entry.by)));
    const reads = inside
      .flatMap((landing) => landing.readers)
      .filter((entry) => !own.has(entry.by) && (entry.call != null || !writers.has(entry.by)));
    const readers = readerFiles(reads).filter((reader) => !under(reader.path, target));
    return { place: ctx.place(target), readers, target };
  });
}

function readFacts(ctx, members, written, within) {
  const own = new Set(members);
  const targets = ctx.landings
    .filter((landing) => landing.readers.some((entry) => own.has(entry.by)))
    .map((landing) => landing.target)
    .filter((target) => !own.has(target) && !written.some((place) => under(target, place.target)))
    .filter((target) => within == null || !under(target, within));
  return cover(targets).map(ctx.place);
}

function writeLine(ctx, write) {
  if (write.readers.length === 0) return `Writes to ${write.place}; nothing in this repository reads it.`;
  const items = collapse(ctx, write.readers.map(readerItem));
  return `Writes to ${write.place}; read by ${list(worded(items, ctx.shown))}.`;
}

/**
 * How a landing target relates to the place explained: the place itself
 * ('exact'), a place inside it ('inside'), or a directory that holds it
 * ('parent'); null when it is none of these. A part drawn from one directory
 * is that directory; a part drawn from other globs is a place only where a
 * landing falls on its own files, or on a directory every tracked file of
 * which is its own.
 *
 * @returns {null | 'exact' | 'inside' | 'parent'}
 */
function relationOf(ctx, found, target) {
  const root = found.kind === 'part' ? partRoot(ctx, found.part) : found.path;
  if (root != null) {
    if (target === root) return 'exact';
    if (under(target, root)) return 'inside';
    if (under(root, target)) return 'parent';
    return null;
  }
  const own = new Set(found.members);
  if (own.has(target)) return 'exact';
  const held = found.members.filter((path) => path.startsWith(`${target}/`));
  if (held.length > 0 && [...ctx.boundaryOf.keys()].filter((path) => path.startsWith(`${target}/`)).length === held.length) return 'inside';
  return null;
}

function partRoot(ctx, part) {
  const boundary = ctx.boundaries.find((item) => item.name === part);
  return boundary ? boundaryRoot(boundary) : null;
}

/**
 * Who writes the place explained and who reads it, from the landings the
 * page states (weak entries, places that span parts and untracked places
 * left out, as on the page). A writer is named with the place it writes and
 * how near that is; a reader of the place or of a place inside it is named
 * as the page names readers. A member's own read of the place, and a
 * workflow naming a place it writes itself, are the making of the place,
 * not a use of it.
 *
 * @returns {{ readBy: object[], writtenBy: object[], writtenByDoors: string[] }}
 */
function placeFacts(ctx, found) {
  const related = ctx.landings
    .map((landing) => ({ landing, relation: relationOf(ctx, found, landing.target) }))
    .filter((entry) => entry.relation != null);
  const writtenBy = new Map();
  for (const { landing, relation } of related) {
    for (const entry of landing.writers) {
      const place = ctx.place(landing.target);
      writtenBy.set(`${entry.by}\0${place}`, { by: entry.by, place, relation });
    }
  }
  const writers = new Set([...writtenBy.values()].map((entry) => entry.by));
  const own = new Set(found.members);
  const reads = related
    .filter(({ relation }) => relation !== 'parent')
    .flatMap(({ landing }) => landing.readers)
    .filter((entry) => !own.has(entry.by) && (entry.call != null || !writers.has(entry.by)));
  const readBy = readerFiles(reads).map((reader) => ({
    by: reader.path,
    ...(reader.config ? { config: true } : {}),
    ...(reader.fromTests ? { fromTests: true } : {}),
    ...(reader.text ? { text: true } : {}),
  }));
  const targets = related.map(({ landing }) => landing.target);
  const writtenByDoors = ctx.doors
    .filter((door) => !door.parseError && (door.landings ?? []).some((target) => targets.includes(target)))
    .map((door) => door.name);
  const rank = (entry) => RELATIONS.indexOf(entry.relation);
  return {
    readBy,
    writtenBy: [...writtenBy.values()].sort((a, b) => cmp(a.by, b.by) || rank(a) - rank(b) || cmp(a.place, b.place)),
    writtenByDoors,
  };
}

// "lib/ledger.js (into store/ledger/)", "tools/rebuild.js (which writes
// indexes/)", or the path alone when it writes the place itself.
function writerText(entries) {
  const exact = entries.some((entry) => entry.relation === 'exact');
  const into = entries.filter((entry) => entry.relation === 'inside').map((entry) => entry.place);
  const holding = entries.filter((entry) => entry.relation === 'parent').map((entry) => entry.place);
  const notes = [];
  if (into.length > 0) notes.push(`into ${list(into)}`);
  if (holding.length > 0) notes.push(`which writes ${list(holding)}`);
  return exact || notes.length === 0 ? entries[0].by : `${entries[0].by} (${notes.join('; ')})`;
}

function placeLines(ctx, place) {
  const lines = [];
  if (place.writtenBy.length > 0) {
    const byWriter = new Map();
    for (const entry of place.writtenBy) byWriter.set(entry.by, [...(byWriter.get(entry.by) ?? []), entry]);
    lines.push(`Written by ${list([...byWriter.values()].map(writerText))}.`);
  }
  if (place.readBy.length > 0) {
    const readers = place.readBy.map((entry) => ({ path: entry.by, text: entry.text === true, config: entry.config === true, fromTests: entry.fromTests === true }));
    lines.push(`Read by ${list(worded(collapse(ctx, readers.map(readerItem)), ctx.shown))}.`);
  }
  if (place.writtenByDoors.length > 0) {
    lines.push(`${list(place.writtenByDoors)} ${place.writtenByDoors.length === 1 ? 'writes' : 'write'} to it.`);
  }
  return lines;
}

function pairFacts(ctx, found) {
  const inside = (path) => {
    if (found.kind === 'file') return path === found.path;
    if (found.kind === 'part') return ctx.boundaryOf.get(path) === found.part;
    return path.startsWith(`${found.path}/`);
  };
  return (ctx.statistics.pairs ?? [])
    .filter((pair) => inside(pair.a) || inside(pair.b))
    .sort((x, y) => y.strength - x.strength || y.shared - x.shared || cmp(x.a, y.a) || cmp(x.b, y.b))
    .slice(0, PAIRS_SHOWN)
    .map((pair) => {
      if (found.kind === 'file') {
        return { either: pair.either, file: pair.a === found.path ? pair.b : pair.a, shared: pair.shared, strength: pair.strength };
      }
      return { a: pair.a, b: pair.b, either: pair.either, shared: pair.shared, strength: pair.strength };
    });
}

function pairLine(pair) {
  const commits = count(pair.either, 'commit');
  if (pair.file) return `Changes with ${pair.file} in ${pair.shared} of ${commits}.`;
  return `${pair.a} and ${pair.b} change together in ${pair.shared} of ${commits}.`;
}

// The names page.json gives the parts these facts name, so a reader of the
// JSON words a part as the page does; the fields themselves keep the ids.
function labelsFor(ctx, facts) {
  const ids = [
    facts.part,
    ...facts.imports,
    ...facts.importedBy,
    ...facts.importedByTests,
    ...(facts.parts ?? []).map((entry) => entry.part),
  ].filter((part) => part != null);
  return Object.fromEntries([...new Set(ids)].sort(cmp).map((part) => [part, ctx.shown(part)]));
}

function mapLine(map) {
  const commit = map.commit.slice(0, 7);
  const date = map.generatedAt.slice(0, 10);
  if (!commit) return date ? `Map from ${date}.` : 'The map does not say which commit it is from.';
  return date ? `Map from commit ${commit}, ${date}.` : `Map from commit ${commit}.`;
}

// What a part imports and what imports it, at part grain, and what it could
// not resolve. A file or directory is spoken of through its part; a part is
// the subject itself.
function partImportLines(ctx, facts, role, subject) {
  const lines = [];
  // A configuration or documentation part that no part imports and that
  // imports nothing has no import line to state.
  if (!(role === 'code' || facts.imports.length + facts.importedBy.length + facts.importedByTests.length + facts.unresolved + facts.externals > 0)) return lines;
  const own = subject === 'part';
  const lead = own ? 'It' : 'Its part';
  lines.push(facts.imports.length > 0
    ? `${lead} imports ${count(facts.imports.length, 'part')}: ${shownList(facts.imports.map(ctx.shown))}.`
    : `${lead} imports no other part.`);
  const tests = testsClause(facts.importedBy.length, facts.importedByTests.length);
  if (facts.importedBy.length > 0) {
    lines.push(`${lead} is imported by ${count(facts.importedBy.length, 'part')}: ${shownList(facts.importedBy.map(ctx.shown))}${tests ? `, ${tests}` : ''}.`);
  } else {
    lines.push(facts.importedByTests.length > 0
      ? `${lead} is imported only from tests, by ${count(facts.importedByTests.length, 'part')}: ${shownList(facts.importedByTests.map(ctx.shown))}.`
      : `No other part imports ${own ? 'it' : 'its part'}.`);
  }
  const declared = externalsLine(facts.externals, facts.externalNames ?? []);
  if (declared) lines.push(`In ${own ? 'it' : 'its part'}, ${declared.replace(/^\d+ import sites?/, (text) => text.replace('import site', 'import'))}`);
  if (facts.unresolved > 0) lines.push(`${count(facts.unresolved, 'import')} in ${own ? 'it' : 'its part'} could not be resolved.`);
  return lines;
}

function partImports(ctx, part, facts) {
  const edges = partEdges(ctx);
  facts.imports = edges.imports(part);
  facts.importedBy = edges.importedBy(part);
  facts.importedByTests = edges.importedByTests(part);
  const boundary = ctx.boundaries.find((item) => item.name === part);
  facts.unresolved = boundary?.unresolvedSites ?? 0;
  facts.externals = boundary?.externals ?? 0;
  facts.externalNames = boundary?.externalNames ?? [];
}

function blankFacts(found, map) {
  return {
    changesWith: [],
    doors: { builtBy: [], checkedBy: [], isDoor: null, onPath: [], runBy: [] },
    externals: 0,
    generatedAt: map.generatedAt,
    importGrain: 'part',
    importedBy: [],
    importedByTests: [],
    imports: [],
    kind: found.kind,
    mapCommit: map.commit,
    part: null,
    partLabel: null,
    path: found.path,
    readBy: [],
    reads: [],
    role: null,
    sequence: null,
    unresolved: 0,
    writes: [],
    writtenBy: [],
    writtenByDoors: [],
  };
}

function explainFound(ctx, found, map) {
  if (found.kind === 'part') return explainPart(ctx, found, map);
  const { parts, loose } = partsIn(ctx, found.members);
  const overlap = found.kind === 'file' ? overlapOf(ctx, found.path) : null;
  const facts = blankFacts(found, map);
  const lines = [];
  const shownPath = found.kind === 'directory' ? `${found.path}/` : found.path;
  if (found.kind === 'directory') facts.files = found.members.length;

  if (overlap || parts.length > 1) {
    const named = overlap
      ? overlap.boundaries.map((part) => ctx.shown(part))
      : parts.map((entry) => `${entry.partLabel} (${count(entry.files, 'file')})`);
    facts.parts = overlap
      ? overlap.boundaries.map((part) => ({ part, partLabel: ctx.shown(part) }))
      : parts;
    lines.push(overlap
      ? `${shownPath} is in more than one part: ${list(named)}.`
      : `${shownPath} is a directory whose files are in ${count(parts.length, 'part')}: ${shownList(named)}${loose > 0 ? `, and ${count(loose, 'file')} in no part` : ''}.`);
    const place = placeFacts(ctx, found);
    Object.assign(facts, place);
    lines.push(...placeLines(ctx, place));
    lines.push('Explain a path inside one part for its doors, imports and order of work.');
    lines.push(mapLine(map));
    facts.partLabels = labelsFor(ctx, facts);
    return { facts, lines };
  }

  const part = parts[0] ?? null;
  if (part) {
    facts.part = part.part;
    facts.partLabel = part.partLabel;
    facts.role = part.role;
  }
  if (found.kind === 'file') {
    lines.push(part ? `${shownPath} is in ${part.partLabel} (${part.role}).` : `${shownPath} is not in any part.`);
  } else if (part) {
    const files = loose > 0
      ? `${part.files} of its ${found.members.length} files ${part.files === 1 ? 'is' : 'are'}`
      : (part.files === 1 ? 'its one file is' : `its ${part.files} files are`);
    lines.push(`${shownPath} is a directory; ${files} in ${part.partLabel} (${part.role}), the part explained here.`);
  } else {
    lines.push(`${shownPath} is a directory of ${count(found.members.length, 'file')}, none of them in any part.`);
  }

  const doors = doorFacts(ctx, found, part?.part ?? null);
  facts.doors = { builtBy: doors.builtBy, checkedBy: doors.checkedBy, isDoor: doors.self?.name ?? null, onPath: doors.onPath, runBy: doors.runBy };
  lines.push(doorLine(doors, part?.partLabel ?? null, found.kind));

  const place = placeFacts(ctx, found);
  Object.assign(facts, place);
  lines.push(...placeLines(ctx, place));

  if (found.kind === 'file') {
    const own = fileImports(ctx, found.path);
    Object.assign(facts, own);
    lines.push(...fileImportLines(ctx, own));
  }

  if (part) {
    partImports(ctx, part.part, facts);
    lines.push(...partImportLines(ctx, facts, part.role, found.kind));
  }

  const within = found.kind === 'directory' ? found.path : null;
  const written = writeFacts(ctx, found.members);
  facts.writes = written.map((write) => ({ place: write.place, readers: write.readers.map((reader) => reader.path) }));
  for (const write of written) lines.push(writeLine(ctx, write));
  facts.reads = readFacts(ctx, found.members, written, within);
  if (facts.reads.length > 0) lines.push(`Reads ${shownList(facts.reads)}.`);

  if (found.kind === 'file') {
    const order = entryOrder(ctx, found.path, (phrase) => `Inside it, ${phrase} does, in order:`);
    if (order) {
      lines.push(order.sentence);
      facts.sequence = { entry: order.entry, phrase: order.phrase, steps: order.steps };
    } else {
      lines.push(NO_ORDER);
    }
  } else {
    lines.push(...orderLines(ctx, found, facts));
  }

  facts.changesWith = pairFacts(ctx, found);
  for (const pair of facts.changesWith) lines.push(pairLine(pair));
  lines.push(mapLine(map));
  facts.partLabels = labelsFor(ctx, facts);
  return { facts, lines };
}

// The files among the members that carry an order of work, for a directory
// or a part, each explained on its own.
function orderLines(ctx, found, facts) {
  const ordered = found.members.filter((path) => entryOrder(ctx, path, () => '') != null);
  facts.sequences = ordered;
  return [ordered.length > 0
    ? `An order of work is recorded for ${shownList(ordered)}; explain ${ordered.length === 1 ? 'it' : 'one'} for its steps.`
    : NO_ORDER];
}

/**
 * A part named by its boundary-file name: what it is drawn from, the doors
 * that run its files or pass through it, who writes it and who reads it when
 * it is a place, what it imports and what imports it, what it writes and
 * reads, where an order of work is recorded, and what changes with it.
 */
function explainPart(ctx, found, map) {
  const boundary = ctx.boundaries.find((item) => item.name === found.part);
  const facts = blankFacts(found, map);
  const label = ctx.shown(boundary.name);
  facts.part = boundary.name;
  facts.partLabel = label;
  facts.role = boundary.role ?? null;
  facts.files = found.members.length;
  facts.globs = [...(boundary.globs ?? [])];
  facts.entryPoints = [...(boundary.entryPoints ?? [])];
  facts.testedBy = boundary.testedBy ?? 0;
  const globs = facts.globs.map((glob) => `\`${glob}\``);
  // A part's name is an identifier and keeps its case; the page's words for a
  // part drawn from the top of the tree, or the one site, are prose.
  const subject = label === boundary.name ? label : capitalize(label);
  const lines = [`${subject} is a part of ${count(found.members.length, 'file')} (${facts.role}), drawn from ${list(globs)}.`];

  const doors = doorFacts(ctx, found, boundary.name);
  facts.doors = { builtBy: doors.builtBy, checkedBy: doors.checkedBy, isDoor: null, onPath: doors.onPath, runBy: doors.runBy };
  lines.push(doorLine(doors, label, 'part'));

  const place = placeFacts(ctx, found);
  Object.assign(facts, place);
  lines.push(...placeLines(ctx, place));

  partImports(ctx, boundary.name, facts);
  lines.push(...partImportLines(ctx, facts, facts.role, 'part'));

  const written = writeFacts(ctx, found.members);
  facts.writes = written.map((write) => ({ place: write.place, readers: write.readers.map((reader) => reader.path) }));
  for (const write of written) lines.push(writeLine(ctx, write));
  const root = boundaryRoot(boundary);
  facts.reads = readFacts(ctx, found.members, written, root);
  if (facts.reads.length > 0) lines.push(`Reads ${shownList(facts.reads)}.`);

  lines.push(...orderLines(ctx, found, facts));
  facts.changesWith = pairFacts(ctx, found);
  for (const pair of facts.changesWith) lines.push(pairLine(pair));
  lines.push(mapLine(map));
  facts.partLabels = labelsFor(ctx, facts);
  return { facts, lines };
}

/**
 * What explain says about one target, from artifacts already read: the
 * sentences and the facts, or the failure it prints. Shared by the command
 * line and the sidecar, so both state the same facts in the same words.
 *
 * @param {{ structure: object, statistics?: object, page?: object|null }} map the committed artifacts
 * @param {{ repo: string, prefix?: string, target: string }} request
 * @returns {{ ok: true, found: object, facts: object, lines: string[], ctx: object }
 *   | { ok: false, code: string, details: string[], whatToDo: string }}
 */
export function explainTarget({ structure, statistics = {}, page = null }, { repo, prefix = '', target }) {
  const ctx = pageFacts({ structure, statistics: statistics ?? {} });
  const tried = candidates(repo, prefix, target);
  const found = locate(ctx, tried, target);
  if (!found) {
    return {
      ok: false,
      code: 'ATLAS_EXPLAIN_UNKNOWN_PATH',
      details: [`${target} names no file, directory or part in atlas/structure.json`],
      whatToDo: 'check the path or the part name, or run atlas map if the file is new',
    };
  }
  const { facts, lines } = explainFound(ctx, found, mapCommit(page, statistics, structure));
  return { ok: true, ctx, found, facts: sortKeys(facts), lines };
}

/**
 * @param {string} repo    the repository root
 * @param {string} prefix  the caller's directory inside the repository, posix, '' at the root
 * @param {string[]} argv  the arguments after `explain`
 * @returns {number} exit code
 */
export function explainCommand(repo, prefix, argv) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stdout.write(`${args.error}\nexit 2\n`);
    return 2;
  }
  const structure = readJson(join(repo, 'atlas', 'structure.json'));
  if (!structure.value) {
    process.stdout.write(formatFailure('ATLAS_EXPLAIN_NO_MAP', [
      structure.absent ? 'atlas/structure.json is absent' : 'atlas/structure.json is not valid JSON',
    ], { exitCode: 2, whatToDo: 'run atlas map and commit atlas/' }));
    return 2;
  }
  const statistics = readJson(join(repo, 'atlas', 'statistics.json')).value ?? {};
  const page = readJson(join(repo, 'atlas', 'page.json')).value ?? null;
  const answer = explainTarget({ structure: structure.value, statistics, page }, { repo, prefix, target: args.target });
  if (!answer.ok) {
    process.stdout.write(formatFailure(answer.code, answer.details, { exitCode: 2, whatToDo: answer.whatToDo }));
    return 2;
  }
  process.stdout.write(args.json ? `${JSON.stringify(answer.facts, null, 2)}\n` : `${answer.lines.join('\n')}\n`);
  return 0;
}
