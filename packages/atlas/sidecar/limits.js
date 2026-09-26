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
  return keys.filter((key) => key.includes(':')).map((key) => key.slice(key.indexOf(':') + 1)).sort();
}

function partEntries(boundary) {
  const part = boundary.name;
  const out = [];
  if ((boundary.unresolvedSites ?? 0) > 0) {
    out.push({
      basis: 'unresolved',
      what: 'import',
      grain: 'part',
      part,
      count: boundary.unresolvedSites,
      named: (boundary.unresolvedNamed ?? []).map((entry) => ({ path: entry.path, specifier: entry.specifier ?? null, why: entry.why })),
    });
  }
  for (const [field, what] of [['dynamicReads', 'read'], ['dynamicWrites', 'write']]) {
    if ((boundary[field] ?? 0) > 0) out.push({ basis: 'unresolved', what, grain: 'part', part, count: boundary[field], named: [], reason: 'a path built at run time' });
  }
  if ((boundary.dynamicSpawns ?? 0) > 0) {
    out.push({
      basis: 'unresolved',
      what: 'command',
      grain: 'part',
      part,
      count: boundary.dynamicSpawns,
      named: [],
      reason: (boundary.dynamicSpawnsInTests ?? 0) > 0 ? `a command built at run time, ${boundary.dynamicSpawnsInTests} of them in tests` : 'a command built at run time',
    });
  }
  for (const entry of boundary.outsidePlaces ?? []) {
    for (const [field, what] of [['writes', 'write'], ['reads', 'read']]) {
      if ((entry[field] ?? 0) === 0) continue;
      const places = spelled(entry.where ?? []);
      out.push({ basis: 'outside', what, grain: 'part', part, count: entry[field], where: whereOf(entry.where ?? []), named: [], ...(places.length > 0 ? { places } : {}) });
    }
  }
  // Counted but placed nowhere by the breakdown above: the rest of the
  // outside reads and writes, said as the caller's.
  for (const [field, what] of [['outsideWrites', 'write'], ['outsideReads', 'read']]) {
    const placed = (boundary.outsidePlaces ?? []).reduce((sum, entry) => sum + (entry[what === 'write' ? 'writes' : 'reads'] ?? 0), 0);
    const rest = (boundary[field] ?? 0) - placed;
    if (rest > 0) out.push({ basis: 'outside', what, grain: 'part', part, count: rest, where: 'caller', named: [] });
  }
  if ((boundary.outsideImports ?? 0) > 0) {
    out.push({ basis: 'outside', what: 'import', grain: 'part', part, count: boundary.outsideImports, where: 'another-repository', named: [], reason: 'a path outside this repository' });
  }
  if ((boundary.externals ?? 0) > 0) {
    out.push({ basis: 'outside', what: 'import', grain: 'part', part, count: boundary.externals, where: 'another-repository', named: [...(boundary.externalNames ?? [])], reason: 'read as a declared dependency that shares its name with a local module' });
  }
  for (const [field, what] of [['userDataWrites', 'write'], ['userDataReads', 'read']]) {
    if ((boundary[field] ?? 0) > 0) out.push({ basis: 'outside', what, grain: 'part', part, count: boundary[field], where: 'home', named: [], reason: "the player's data directory (user://)" });
  }
  return out;
}

/**
 * @param {{ structure: object, page: object|null }} snapshot
 * @param {{ files?: string[], parts?: string[], doors?: object[] }} question
 *   files: the tracked files the question is about; parts: their parts;
 *   doors: the doors the answer names
 * @returns {object[]} cannot-see entries (answer.js CANNOT_SEE_SCHEMA)
 */
export function cannotSeeFor(snapshot, { files = [], parts = [], doors = [] }) {
  const { structure } = snapshot;
  const asked = new Set(files);
  const out = [];
  const fileOf = new Map();
  for (const boundary of structure.boundaries ?? []) for (const file of boundary.files ?? []) fileOf.set(file.path, file);
  for (const file of [...(structure.unassigned ?? []), ...(structure.overlaps ?? [])]) fileOf.set(file.path, file);
  const unread = [...asked].filter((path) => fileOf.get(path)?.parseError).sort();
  if (unread.length > 0) {
    out.push({ basis: 'unresolved', what: 'file', grain: 'file', count: unread.length, named: unread.map((path) => ({ path, syntax: fileOf.get(path).unreadSyntax ?? null })), reason: 'syntax the parser cannot read, so what it imports is not known' });
  }
  for (const name of [...new Set(parts)].sort()) {
    const boundary = (structure.boundaries ?? []).find((item) => item.name === name);
    if (boundary) out.push(...partEntries(boundary));
  }
  // Writes to places the repository does not track, by the files asked about.
  for (const landing of structure.landings ?? []) {
    if (landing.tracked !== false) continue;
    const writers = (landing.writers ?? []).filter((entry) => asked.has(entry.by)).map((entry) => entry.by);
    if (writers.length > 0) out.push({ basis: 'outside', what: 'write', grain: 'file', count: writers.length, where: 'untracked', named: writers.map((by) => ({ by, target: landing.target })) });
  }
  // Reads by raw URL go over HTTP to what is published, not to the checkout.
  const own = String(snapshot.page?.repo ?? '');
  for (const landing of structure.landings ?? []) {
    const byUrl = (landing.readers ?? []).filter((entry) => entry.call === 'raw-url' && asked.has(entry.by));
    if (byUrl.length > 0) {
      out.push({ basis: 'outside', what: 'read', grain: 'file', count: byUrl.length, where: 'http', named: byUrl.map((entry) => ({ by: entry.by, target: landing.target, repo: entry.repo ?? null, ref: entry.ref ?? null, ...(entry.repo && own && entry.repo !== own ? { otherRepository: true } : {}) })) });
    }
  }
  // A call over HTTP between parts: drawn as an edge, and no reach crosses it.
  const touched = new Set(parts);
  const http = (structure.edges ?? []).filter((edge) => edge.kind === 'http' && edge.from !== edge.to && (touched.has(edge.from) || touched.has(edge.to)));
  if (http.length > 0) {
    out.push({ basis: 'outside', what: 'call', grain: 'part', count: http.length, where: 'http', named: http.map((edge) => ({ from: edge.from, to: edge.to, routes: edge.routes ?? 1 })) });
  }
  // What the doors named send to other repositories: clones they commit
  // into, and dispatches.
  for (const door of doors) {
    if (door.parseError) continue;
    const clones = (door.elsewhere ?? []).map((entry) => ({ door: door.name, clone: entry.clone, pushes: entry.pushes === true }));
    if (clones.length > 0) out.push({ basis: 'outside', what: 'write', grain: 'door', count: clones.length, where: 'another-repository', named: clones });
    const dispatches = (door.sends?.dispatchesTo ?? []).map((target) => ({ door: door.name, to: target }));
    if (dispatches.length > 0) out.push({ basis: 'outside', what: 'dispatch', grain: 'door', count: dispatches.length, where: 'another-repository', named: dispatches });
  }
  return out;
}

const WHERE_WORDS = {
  caller: "the caller's places (the directory it is run in, or a path it is handed)",
  home: 'the home directory',
  temporary: 'a temporary directory',
  untracked: 'places this repository does not track',
  'another-repository': 'another repository',
  http: 'HTTP',
};

function count(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Atlas's sentence for one cannot-see entry. */
export function cannotSeeSentence(entry, shown = (name) => name) {
  const within = entry.part ? ` in ${shown(entry.part)}` : '';
  if (entry.basis === 'unresolved') {
    if (entry.what === 'file') return `Atlas cannot see what ${entry.named.map((item) => item.path).join(', ')} import${entry.count === 1 ? 's' : ''}: the parser cannot read ${entry.count === 1 ? 'it' : 'them'}.`;
    if (entry.what === 'import') return `Atlas cannot see where ${count(entry.count, 'import')}${within} ${entry.count === 1 ? 'leads' : 'lead'}: ${entry.count === 1 ? 'it does' : 'they do'} not resolve.`;
    if (entry.what === 'command') return `Atlas cannot see ${count(entry.count, 'command')}${within} built at run time.`;
    return `Atlas cannot see the ${count(entry.count, 'path')}${within} built at run time to ${entry.what}.`;
  }
  const places = entry.places?.length > 0 ? ` (${entry.places.join(', ')})` : '';
  const verb = { call: 'call', dispatch: 'dispatch', import: 'import', read: 'read', write: 'write' }[entry.what] ?? entry.what;
  return `Atlas does not follow ${count(entry.count, verb)}${within} that go${entry.count === 1 ? 'es' : ''} to ${WHERE_WORDS[entry.where] ?? entry.where}${places}.`;
}
