import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, posix, relative } from 'node:path';
import { formatFailure } from './errors.js';
import { collapse, count, cover, entryOrder, externalsLine, list, pageFacts, readerFiles, under, worded } from './page.js';

/**
 * atlas explain: what one file, or one directory, is in the system, read from
 * the committed artifacts alone. It never maps, so it answers from what the
 * repository last committed and says which commit that was.
 */

const LISTED = 6;
const PAIRS_SHOWN = 3;
const NO_ORDER = 'No order of work is recorded; only files a door runs, and the files they call, carry one.';

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

function partEdges(ctx) {
  const imports = new Map();
  const importedBy = new Map();
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from === edge.to) continue;
    if (!imports.has(edge.from)) imports.set(edge.from, new Set());
    if (!importedBy.has(edge.to)) importedBy.set(edge.to, new Set());
    imports.get(edge.from).add(edge.to);
    importedBy.get(edge.to).add(edge.from);
  }
  return {
    imports: (part) => [...(imports.get(part) ?? [])].sort(cmp),
    importedBy: (part) => [...(importedBy.get(part) ?? [])].sort(cmp),
  };
}

function overlapOf(ctx, path) {
  return (ctx.structure.overlaps ?? []).find((file) => file.path === path) ?? null;
}

function locate(ctx, tried) {
  for (const path of tried) {
    if (ctx.fileOf.has(path)) return { kind: 'file', path, members: [path] };
  }
  for (const path of tried) {
    const members = [...ctx.fileOf.keys()].filter((file) => file.startsWith(`${path}/`)).sort(cmp);
    if (members.length > 0) return { kind: 'directory', path, members };
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
  const runBy = readable.filter((door) => (door.runs ?? []).some(runs)).map((door) => door.name);
  const onPath = part == null
    ? []
    : readable.filter((door) => (door.reach ?? []).some((entry) => entry.boundary === part)).map((door) => door.name);
  const self = found.kind === 'file' ? ctx.doors.find((door) => door.file === found.path) ?? null : null;
  return { onPath, runBy, self };
}

function doorLine(doors, partLabel, kind) {
  if (doors.self) {
    const { name, parseError } = doors.self;
    return parseError ? `It is the door ${name}, whose workflow could not be read.` : `It is the door ${name}.`;
  }
  const directory = kind === 'directory';
  if (doors.runBy.length > 0) {
    if (!directory) return `Run by ${list(doors.runBy)}.`;
    return `${list(doors.runBy)} ${doors.runBy.length === 1 ? 'runs' : 'run'} files in it.`;
  }
  if (doors.onPath.length > 0) return `On the path of ${list(doors.onPath)} through ${partLabel}.`;
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
  const items = collapse(ctx, write.readers.map((reader) => ({
    path: reader.path,
    text: reader.text ? `${reader.path} (found by text)` : reader.path,
  })));
  return `Writes to ${write.place}; read by ${list(worded(items, ctx.shown))}.`;
}

function pairFacts(ctx, found) {
  const inside = (path) => (found.kind === 'file' ? path === found.path : path.startsWith(`${found.path}/`));
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

function mapLine(map) {
  const commit = map.commit.slice(0, 7);
  const date = map.generatedAt.slice(0, 10);
  if (!commit) return date ? `Map from ${date}.` : 'The map does not say which commit it is from.';
  return date ? `Map from commit ${commit}, ${date}.` : `Map from commit ${commit}.`;
}

function explainFound(ctx, found, map) {
  const { parts, loose } = partsIn(ctx, found.members);
  const overlap = found.kind === 'file' ? overlapOf(ctx, found.path) : null;
  const facts = {
    changesWith: [],
    doors: { isDoor: null, onPath: [], runBy: [] },
    externals: 0,
    generatedAt: map.generatedAt,
    importGrain: 'part',
    importedBy: [],
    imports: [],
    kind: found.kind,
    mapCommit: map.commit,
    part: null,
    partLabel: null,
    path: found.path,
    reads: [],
    role: null,
    sequence: null,
    unresolved: 0,
    writes: [],
  };
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
    lines.push('Explain a path inside one part for its doors, imports and order of work.');
    lines.push(mapLine(map));
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
  facts.doors = { isDoor: doors.self?.name ?? null, onPath: doors.onPath, runBy: doors.runBy };
  lines.push(doorLine(doors, part?.partLabel ?? null, found.kind));

  if (part) {
    const edges = partEdges(ctx);
    facts.imports = edges.imports(part.part);
    facts.importedBy = edges.importedBy(part.part);
    const boundary = ctx.boundaries.find((item) => item.name === part.part);
    facts.unresolved = boundary?.unresolvedSites ?? 0;
    facts.externals = boundary?.externals ?? 0;
    facts.externalNames = boundary?.externalNames ?? [];
  }
  // A configuration or documentation part that no part imports and that
  // imports nothing has no import line to state.
  if (part && (part.role === 'code' || facts.imports.length + facts.importedBy.length + facts.unresolved + facts.externals > 0)) {
    lines.push(facts.imports.length > 0
      ? `Its part imports ${count(facts.imports.length, 'part')}: ${shownList(facts.imports.map(ctx.shown))}.`
      : 'Its part imports no other part.');
    lines.push(facts.importedBy.length > 0
      ? `Its part is imported by ${count(facts.importedBy.length, 'part')}: ${shownList(facts.importedBy.map(ctx.shown))}.`
      : 'No other part imports its part.');
    const declared = externalsLine(facts.externals, facts.externalNames ?? []);
    if (declared) lines.push(`In its part, ${declared.replace(/^\d+ import sites?/, (text) => text.replace('import site', 'import'))}`);
    if (facts.unresolved > 0) lines.push(`${count(facts.unresolved, 'import')} in its part could not be resolved.`);
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
    const ordered = found.members.filter((path) => entryOrder(ctx, path, () => '') != null);
    facts.sequences = ordered;
    lines.push(ordered.length > 0
      ? `An order of work is recorded for ${shownList(ordered)}; explain ${ordered.length === 1 ? 'it' : 'one'} for its steps.`
      : NO_ORDER);
  }

  facts.changesWith = pairFacts(ctx, found);
  for (const pair of facts.changesWith) lines.push(pairLine(pair));
  lines.push(mapLine(map));
  return { facts, lines };
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
  const ctx = pageFacts({ structure: structure.value, statistics });
  const tried = candidates(repo, prefix, args.target);
  const found = locate(ctx, tried);
  if (!found) {
    process.stdout.write(formatFailure('ATLAS_EXPLAIN_UNKNOWN_PATH', [
      `${args.target} names no file or directory in atlas/structure.json`,
    ], { exitCode: 2, whatToDo: 'check the path, or run atlas map if the file is new' }));
    return 2;
  }
  const { facts, lines } = explainFound(ctx, found, mapCommit(page, statistics, structure.value));
  process.stdout.write(args.json ? `${JSON.stringify(sortKeys(facts), null, 2)}\n` : `${lines.join('\n')}\n`);
  return 0;
}
