import { rereadFiles } from '../core/index.js';
import { loadsManifest } from '../core/languages.js';
import { unresolvedEntry } from '../adapter/artifact.js';
import { basisOf, byBasis, group } from './answer.js';

/**
 * A scoped re-read of files that changed after the map, as answers show it:
 * what each file imports, writes and reads now, read by the engine's own
 * per-file code (core/index.js rereadFiles), marked re-read and set beside
 * the map's view, never merged into it. What the file cannot be seen to do
 * is stated at the file's own grain, since the re-read counts per file.
 */

const RESOLVED = new Set(['file', 'boundary', 'external']);

function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

// A place as the map shows it: a directory with a trailing slash.
function placeOf(snapshot, target) {
  return snapshot.ctx.place(target);
}

// Whether the map holds a place: a tracked file, a directory of tracked
// files, or a shape (records/*) inside one. A write elsewhere lands on
// nothing the repository keeps, as the map counts it.
function trackedPlace(snapshot, target) {
  const files = snapshot.ctx.fileOf;
  if (files.has(target)) return true;
  const dir = target.includes('*') ? target.slice(0, Math.max(0, target.lastIndexOf('/'))) : target;
  if (dir === '') return target.includes('*');
  return [...files.keys()].some((path) => path.startsWith(`${dir}/`));
}

const DOORS = new WeakMap();

/**
 * The map's doors with the files each runs and the files those import,
 * walked over the map's per-file imports as the engine walks a door's reach:
 * whose directory a re-read file's bare path is depends on them. Worked out
 * once per snapshot.
 */
export function mapDoors(snapshot) {
  if (DOORS.has(snapshot)) return DOORS.get(snapshot);
  const ctx = snapshot.ctx;
  const doors = [];
  for (const door of snapshot.structure.doors ?? []) {
    if (door.parseError) continue;
    const starts = new Set();
    for (const run of door.runs ?? []) {
      if (run.runKind === 'checks' || run.built) continue;
      if (run.path.endsWith('/')) {
        for (const path of ctx.fileOf.keys()) if (path.startsWith(run.path)) starts.add(path);
      } else if (ctx.fileOf.has(run.path)) {
        starts.add(run.path);
      }
    }
    const reached = new Set(starts);
    const queue = [...starts];
    for (let at = 0; at < queue.length; at += 1) {
      for (const target of ctx.fileOf.get(queue[at])?.importsFiles ?? []) {
        if (target.startsWith('@') || reached.has(target)) continue;
        reached.add(target);
        queue.push(target);
      }
    }
    doors.push({ kind: door.kind, example: door.example === true, stages: door.stages ?? [], gated: door.gated ?? [], reachFiles: [...reached] });
  }
  DOORS.set(snapshot, doors);
  return doors;
}

/**
 * Reads the files again with the engine, against the parts and doors of the
 * map.
 *
 * @param {object} snapshot
 * @param {{ root: string }} repo
 * @param {string[]} paths
 * @param {{ content?: (path: string) => Buffer | null }} [options]
 */
export function reread(snapshot, repo, paths, { content = null } = {}) {
  const boundaries = snapshot.structure.boundaries.map((boundary) => ({ name: boundary.name, globs: boundary.globs, role: boundary.role }));
  const importers = importersOf(snapshot);
  return rereadFiles({ repoPath: repo.root, boundaries, paths, content, doors: mapDoors(snapshot), callersOf: (path) => importers.get(path) ?? [] });
}

const IMPORTERS = new WeakMap();

/** The files that import each file, as the map records them, once per snapshot. */
export function importersOf(snapshot) {
  if (IMPORTERS.has(snapshot)) return IMPORTERS.get(snapshot);
  const out = new Map();
  for (const [path, file] of snapshot.ctx.fileOf) {
    for (const target of file.importsFiles ?? []) {
      if (!out.has(target)) out.set(target, []);
      out.get(target).push(path);
    }
  }
  IMPORTERS.set(snapshot, out);
  return out;
}

/** What one reading imports: files, built chunks of a part, and what did not resolve. */
export function importsOf(reading) {
  const files = new Set();
  const unresolved = [];
  for (const site of reading.imports) {
    if (loadsManifest(site)) continue;
    const outcome = site.resolved?.outcome;
    if (outcome === 'manifest') continue;
    if (outcome === 'file' && site.resolved.path !== reading.path && !inAtlas(site.resolved.path)) files.add(site.resolved.path);
    else if (outcome === 'boundary') files.add(`@${site.resolved.boundary}`);
    else if (!RESOLVED.has(outcome)) {
      const { line, ...entry } = unresolvedEntry(reading.path, site);
      unresolved.push(entry);
    }
  }
  return { files: [...files].sort(), unresolved };
}

/**
 * The re-read's facts about one file, each group marked re-read and naming
 * the file, and what the re-read cannot see.
 *
 * @returns {{ facts: object[], cannotSee: object[], sentence: string }}
 */
export function rereadFacts(snapshot, reading) {
  const extra = { source: 're-read', file: reading.path };
  const facts = [];
  const cannotSee = [];
  if (reading.parseError) {
    cannotSee.push({ basis: 'unresolved', what: 'file', grain: 'file', count: 1, named: [{ path: reading.path, syntax: reading.unreadSyntax ?? null }], reason: 'syntax the parser cannot read, so what it imports is not known', source: 're-read' });
  }
  const imports = importsOf(reading);
  if (imports.files.length > 0) facts.push(group('importsFiles', 'parsed', imports.files, { ...extra, grain: 'file' }));
  const place = (target) => placeOf(snapshot, target);
  const kept = reading.writes.filter((write) => trackedPlace(snapshot, write.target));
  const untracked = reading.writes.filter((write) => !trackedPlace(snapshot, write.target));
  facts.push(...byBasis('writes', kept.map((write) => ({ item: place(write.target), basis: basisOf(write.confidence) })), extra));
  facts.push(...byBasis('reads', reading.reads.filter((read) => trackedPlace(snapshot, read.target)).map((read) => ({ item: place(read.target), basis: basisOf(read.confidence) })), extra));
  if (untracked.length > 0) {
    const targets = [...new Set(untracked.map((write) => write.target))].sort();
    cannotSee.push({ basis: 'outside', what: 'write', grain: 'file', count: targets.length, where: 'untracked', named: targets.map((target) => ({ by: reading.path, target })), source: 're-read' });
  }
  for (const factGroup of facts) factGroup.items = [...new Set(factGroup.items)];
  for (const factGroup of facts) factGroup.total = factGroup.items.length;
  if (imports.unresolved.length > 0) {
    cannotSee.push({ basis: 'unresolved', what: 'import', grain: 'file', count: imports.unresolved.length, named: imports.unresolved.map((entry) => ({ path: entry.path, specifier: entry.specifier, why: entry.why })), source: 're-read' });
  }
  for (const [field, what] of [['dynamicReads', 'read'], ['dynamicWrites', 'write']]) {
    if (reading[field] > 0) cannotSee.push({ basis: 'unresolved', what, grain: 'file', count: reading[field], named: [], reason: 'a path built at run time', source: 're-read' });
  }
  if (reading.dynamicSpawns > 0) cannotSee.push({ basis: 'unresolved', what: 'command', grain: 'file', count: reading.dynamicSpawns, named: [], reason: 'a command built at run time', source: 're-read' });
  const leaving = new Map();
  for (const site of reading.outsideWhere) {
    const kinds = new Set((site.where ?? []).map((key) => key.split(':')[0]));
    const where = kinds.has('caller') || kinds.has('cwd') ? 'caller' : kinds.has('home') ? 'home' : kinds.has('temp') ? 'temporary' : 'caller';
    const key = `${site.kind}\0${where}`;
    const entry = leaving.get(key) ?? { basis: 'outside', what: site.kind === 'write' ? 'write' : 'read', grain: 'file', count: 0, where, named: [], source: 're-read' };
    entry.count += 1;
    leaving.set(key, entry);
  }
  cannotSee.push(...leaving.values());
  const said = [];
  if (imports.files.length > 0) said.push(`imports ${imports.files.join(', ')}`);
  const writes = facts.filter((entry) => entry.fact === 'writes').flatMap((entry) => entry.items);
  const reads = facts.filter((entry) => entry.fact === 'reads').flatMap((entry) => entry.items);
  if (writes.length > 0) said.push(`writes ${writes.join(', ')}`);
  if (reads.length > 0) said.push(`reads ${reads.join(', ')}`);
  const sentence = reading.parseError
    ? `Atlas: read again now, ${reading.path} cannot be parsed, so what it imports is not known.`
    : `Atlas: read again now, ${reading.path} ${said.length > 0 ? said.join('; ') : 'imports no file here and writes and reads no place here'} (re-read; the map's view above is from the map).`;
  return { facts, cannotSee, sentence };
}
