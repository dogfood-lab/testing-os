/**
 * What Atlas cannot see for a question: the unresolved and outside entries
 * that touch the files and parts it asks about, so the edge of the map is
 * never mistaken for the edge of the system. Each entry is a count the map
 * recorded, with what it names; nothing is inferred past the map.
 *
 * The engine counts most of these per part, not per file; an entry says its
 * grain, so a count at part grain is never read as the file's own.
 */

// Where a path that leaves the repository goes, in the spec's words, from
// the engine's keys (core/landings.js whereSet): the directory the command is
// run in and a path the caller passes are the caller's; home and temporary
// are their own.
function whereOf(keys) {
  const kinds = new Set(keys.map((key) => key.split(':')[0]));
  if (kinds.has('caller') || kinds.has('cwd')) return 'caller';
  if (kinds.has('home')) return 'home';
  if (kinds.has('temp')) return 'temporary';
  return 'caller';
}

function spelled(keys) {
  return keys.filter((key) => key.includes(':')).map((key) => key.slice(key.indexOf(':') + 1));
}

const OUTSIDE_ORDER = ['caller', 'home', 'temporary'];

/**
 * The reads or writes of a part that leave the repository, one entry per
 * destination, with the directories and files spelled under it merged. The
 * engine's breakdown can place fewer than it counted; the rest are the
 * caller's, as the page says of them.
 */
function outsideOf(boundary, what) {
  const field = what === 'write' ? 'writes' : 'reads';
  const byWhere = new Map();
  for (const entry of boundary.outsidePlaces ?? []) {
    if ((entry[field] ?? 0) === 0) continue;
    const where = whereOf(entry.where ?? []);
    const merged = byWhere.get(where) ?? { count: 0, places: new Set() };
    merged.count += entry[field];
    for (const place of spelled(entry.where ?? [])) merged.places.add(place);
    byWhere.set(where, merged);
  }
  const placed = [...byWhere.values()].reduce((sum, entry) => sum + entry.count, 0);
  const rest = (boundary[what === 'write' ? 'outsideWrites' : 'outsideReads'] ?? 0) - placed;
  if (rest > 0) {
    const caller = byWhere.get('caller') ?? { count: 0, places: new Set() };
    caller.count += rest;
    byWhere.set('caller', caller);
  }
  return OUTSIDE_ORDER.filter((where) => byWhere.has(where)).map((where) => {
    const { count, places } = byWhere.get(where);
    return { basis: 'outside', what, grain: 'part', part: boundary.name, count, where, named: [], ...(places.size > 0 ? { places: [...places].sort() } : {}) };
  });
}

function unresolvedImports(boundary, reason) {
  if ((boundary.unresolvedSites ?? 0) === 0) return [];
  return [{
    basis: 'unresolved',
    what: 'import',
    grain: 'part',
    part: boundary.name,
    count: boundary.unresolvedSites,
    named: (boundary.unresolvedNamed ?? []).map((entry) => ({ path: entry.path, specifier: entry.specifier ?? null, why: entry.why })),
    ...(reason ? { reason } : {}),
  }];
}

function builtAtRunTime(boundary, what) {
  const field = what === 'write' ? 'dynamicWrites' : 'dynamicReads';
  if ((boundary[field] ?? 0) === 0) return [];
  return [{ basis: 'unresolved', what, grain: 'part', part: boundary.name, count: boundary[field], named: [], reason: 'a path built at run time' }];
}

function commands(boundary, reason = null) {
  if ((boundary.dynamicSpawns ?? 0) === 0) return [];
  const tests = boundary.dynamicSpawnsInTests ?? 0;
  const said = tests > 0 ? `a command built at run time, ${tests} of them in tests` : 'a command built at run time';
  return [{ basis: 'unresolved', what: 'command', grain: 'part', part: boundary.name, count: boundary.dynamicSpawns, named: [], reason: reason ? `${said}; ${reason}` : said }];
}

function importsLeaving(boundary) {
  const out = [];
  if ((boundary.outsideImports ?? 0) > 0) {
    out.push({ basis: 'outside', what: 'import', grain: 'part', part: boundary.name, count: boundary.outsideImports, where: 'another-repository', named: [], reason: 'a path outside this repository' });
  }
  if ((boundary.externals ?? 0) > 0) {
    out.push({ basis: 'outside', what: 'import', grain: 'part', part: boundary.name, count: boundary.externals, where: 'another-repository', named: [...(boundary.externalNames ?? [])], reason: 'read as a declared dependency that shares its name with a local module' });
  }
  return out;
}

function userData(boundary, what) {
  const field = what === 'write' ? 'userDataWrites' : 'userDataReads';
  if ((boundary[field] ?? 0) === 0) return [];
  return [{ basis: 'outside', what, grain: 'part', part: boundary.name, count: boundary[field], where: 'home', named: [], reason: "the player's data directory (user://)" }];
}

function fileIndex(structure) {
  const fileOf = new Map();
  for (const boundary of structure.boundaries ?? []) for (const file of boundary.files ?? []) fileOf.set(file.path, file);
  for (const file of [...(structure.unassigned ?? []), ...(structure.overlaps ?? [])]) fileOf.set(file.path, file);
  return fileOf;
}

function unreadable(paths, fileOf, reason) {
  const unread = paths.filter((path) => fileOf.get(path)?.parseError).sort();
  if (unread.length === 0) return [];
  return [{ basis: 'unresolved', what: 'file', grain: 'file', count: unread.length, named: unread.map((path) => ({ path, syntax: fileOf.get(path).unreadSyntax ?? null })), reason }];
}

function untrackedWrites(structure, files) {
  const asked = new Set(files);
  const out = [];
  for (const landing of structure.landings ?? []) {
    if (landing.tracked !== false) continue;
    const writers = (landing.writers ?? []).filter((entry) => asked.has(entry.by)).map((entry) => entry.by);
    if (writers.length > 0) out.push({ basis: 'outside', what: 'write', grain: 'file', count: writers.length, where: 'untracked', named: writers.map((by) => ({ by, target: landing.target })) });
  }
  return out;
}

// Reads by raw URL go over HTTP to what is published, not to the checkout.
function rawUrlReads(snapshot, files) {
  const asked = new Set(files);
  const own = String(snapshot.page?.repo ?? '');
  const out = [];
  for (const landing of snapshot.structure.landings ?? []) {
    const byUrl = (landing.readers ?? []).filter((entry) => entry.call === 'raw-url' && asked.has(entry.by));
    if (byUrl.length === 0) continue;
    out.push({ basis: 'outside', what: 'read', grain: 'file', count: byUrl.length, where: 'http', named: byUrl.map((entry) => ({ by: entry.by, target: landing.target, repo: entry.repo ?? null, ref: entry.ref ?? null, ...(entry.repo && own && entry.repo !== own ? { otherRepository: true } : {}) })) });
  }
  return out;
}

// A call over HTTP between parts: drawn as an edge, and no reach crosses it.
function httpCalls(structure, parts) {
  const touched = new Set(parts);
  const http = (structure.edges ?? []).filter((edge) => edge.kind === 'http' && edge.from !== edge.to && (touched.has(edge.from) || touched.has(edge.to)));
  if (http.length === 0) return [];
  return [{ basis: 'outside', what: 'call', grain: 'part', count: http.length, where: 'http', named: http.map((edge) => ({ from: edge.from, to: edge.to, routes: edge.routes ?? 1 })) }];
}

// What the doors named send to other repositories: clones they commit into,
// and dispatches.
function doorSends(doors) {
  const out = [];
  for (const door of doors) {
    if (door.parseError) continue;
    const clones = (door.elsewhere ?? []).map((entry) => ({ door: door.name, clone: entry.clone, pushes: entry.pushes === true }));
    if (clones.length > 0) out.push({ basis: 'outside', what: 'write', grain: 'door', count: clones.length, where: 'another-repository', named: clones });
    const dispatches = (door.sends?.dispatchesTo ?? []).map((target) => ({ door: door.name, to: target }));
    if (dispatches.length > 0) out.push({ basis: 'outside', what: 'dispatch', grain: 'door', count: dispatches.length, where: 'another-repository', named: dispatches });
  }
  return out;
}

function boundariesNamed(structure, parts) {
  const wanted = new Set(parts);
  return (structure.boundaries ?? []).filter((boundary) => wanted.has(boundary.name)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * What Atlas cannot see about some files and their parts: the files it
 * could not parse, and for each part its unresolved imports, the paths and
 * commands it builds at run time, and the reads, writes and imports that
 * leave the repository; with the untracked writes, raw-URL reads and HTTP
 * calls of the files, and what the doors named send elsewhere.
 *
 * @param {{ structure: object, page: object|null }} snapshot
 * @param {{ files?: string[], parts?: string[], doors?: object[] }} question
 * @returns {object[]} cannot-see entries (answer.js CANNOT_SEE_SCHEMA)
 */
export function cannotSeeFor(snapshot, { files = [], parts = [], doors = [] }) {
  const { structure } = snapshot;
  const out = [...unreadable(files, fileIndex(structure), 'syntax the parser cannot read, so what it imports is not known')];
  for (const boundary of boundariesNamed(structure, parts)) {
    out.push(
      ...unresolvedImports(boundary),
      ...builtAtRunTime(boundary, 'read'),
      ...builtAtRunTime(boundary, 'write'),
      ...commands(boundary),
      ...outsideOf(boundary, 'write'),
      ...outsideOf(boundary, 'read'),
      ...importsLeaving(boundary),
      ...userData(boundary, 'write'),
      ...userData(boundary, 'read'),
    );
  }
  out.push(...untrackedWrites(structure, files), ...rawUrlReads(snapshot, files), ...httpCalls(structure, parts), ...doorSends(doors));
  return out;
}

/**
 * Where a walk back from some files stops: what may depend on them unseen,
 * anywhere in the repository (an import that does not resolve, a file the
 * parser could not read, a command built at run time), and where what the
 * reached code writes goes beyond the map (a path built at run time, a place
 * outside the repository or not tracked). A reached file's reads carry no
 * change onward, so they are not listed.
 *
 * @param {{ structure: object, page: object|null }} snapshot
 * @param {{ reached: string[], reachedParts: string[], doors?: object[], askedParts?: string[] }} walk
 */
export function walkStopsAt(snapshot, { reached, reachedParts, doors = [], askedParts = [] }) {
  const { structure } = snapshot;
  const fileOf = fileIndex(structure);
  const hidden = 'may be one more dependant of the files asked about';
  const everyPart = [...(structure.boundaries ?? [])].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // What the walk reached comes first, then what may reach it from elsewhere.
  const near = new Set(reachedParts);
  const ordered = [...everyPart.filter((boundary) => near.has(boundary.name)), ...everyPart.filter((boundary) => !near.has(boundary.name))];
  const out = [];
  for (const boundary of ordered) {
    const own = near.has(boundary.name);
    if (own) out.push(...builtAtRunTime(boundary, 'write'), ...outsideOf(boundary, 'write'), ...userData(boundary, 'write'));
    out.push(...unresolvedImports(boundary, hidden), ...commands(boundary, hidden));
  }
  out.push(...unreadable([...fileOf.keys()], fileOf, `syntax the parser cannot read, so what it imports is not known; each ${hidden}`));
  out.push(...untrackedWrites(structure, reached), ...httpCalls(structure, askedParts), ...doorSends(doors));
  return out;
}

const WHERE_WORDS = {
  caller: "the caller's places (the directory the command is run in, or a path it is handed)",
  home: 'the home directory',
  temporary: 'a temporary directory',
  untracked: 'places this repository does not track',
  'another-repository': 'another repository',
  http: 'HTTP',
};

function count(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function listed(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// How many spelled places a sentence names before it counts the rest.
const PLACES_NAMED = 4;

/** Atlas's sentence for one cannot-see entry. */
export function cannotSeeSentence(entry, shown = (name) => name) {
  const within = entry.part ? ` in ${shown(entry.part)}` : '';
  const why = entry.reason && /dependant/.test(entry.reason) ? '; any of them may depend on the files asked about' : '';
  if (entry.basis === 'unresolved') {
    if (entry.what === 'file') return `Atlas cannot see what ${count(entry.count, 'file')} import${entry.count === 1 ? 's' : ''}: the parser cannot read ${entry.count === 1 ? 'it' : 'them'}${why}.`;
    if (entry.what === 'import') return `Atlas cannot see where ${count(entry.count, 'import')}${within} ${entry.count === 1 ? 'leads' : 'lead'}: ${entry.count === 1 ? 'it does' : 'they do'} not resolve${why}.`;
    if (entry.what === 'command') return `Atlas cannot see ${count(entry.count, 'command')}${within} built at run time${why}.`;
    return `Atlas cannot see the ${count(entry.count, 'path')}${within} built at run time to ${entry.what}.`;
  }
  const places = entry.places?.length > 0
    ? `, among them ${listed(entry.places.length <= PLACES_NAMED ? entry.places : [...entry.places.slice(0, PLACES_NAMED), `${entry.places.length - PLACES_NAMED} more`])}`
    : '';
  const verb = { call: 'call', dispatch: 'dispatch', import: 'import', read: 'read', write: 'write' }[entry.what] ?? entry.what;
  return `Atlas does not follow ${count(entry.count, verb)}${within} that go${entry.count === 1 ? 'es' : ''} to ${WHERE_WORDS[entry.where] ?? entry.where}${places}.`;
}
