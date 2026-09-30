import { posix } from 'node:path';

/**
 * A tracked package-lock.json, read as git stores it, for the two questions
 * the door checks ask of it (docs/atlas-production.spec.md, Part 3): what a
 * package a directory installs declares (its engines and its bins), and, for
 * each entry that lists optional dependencies, which of those children the
 * lock holds, with the systems each is for. Only lockfileVersion 2 and 3
 * carry the packages section read here; any other version, or a file that
 * does not parse, is unresolved, with why, and is never a finding.
 *
 * Package paths are the lock's own keys: node_modules/astro, or
 * site/node_modules/astro under a workspace member, relative to the lock's
 * directory. A package is looked up the way Node resolves it from a
 * directory: its own node_modules first, then each directory above.
 */

const LOCK = 'package-lock.json';
// Each lock is read once per view of a repository.
const READ = new WeakMap();

/**
 * @param {string} text the lock as git stores it
 * @returns {{ ok: true, version: number, packages: Map<string, object>, lines: Map<string, number> }
 *   | { ok: false, unresolved: string }}
 */
export function readLock(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, unresolved: 'does not parse' };
  }
  if (!isMapping(doc)) return { ok: false, unresolved: 'does not parse' };
  const version = doc.lockfileVersion;
  if (version !== 2 && version !== 3) return { ok: false, unresolved: `lockfileVersion ${version ?? 'missing'}` };
  if (!isMapping(doc.packages)) return { ok: false, unresolved: 'no packages section' };
  const packages = new Map();
  for (const [key, entry] of Object.entries(doc.packages)) if (isMapping(entry)) packages.set(key, entry);
  return { ok: true, version, packages, lines: keyLines(text) };
}

/**
 * The lock a command run in `dir` installs from: the tracked
 * package-lock.json in that directory or the nearest one above it, with the
 * directory relative to the lock's.
 *
 * @param {{ tracked: Set<string>, text: (path: string) => string|null }} repo
 * @param {string} dir a repository directory, '' for the root
 * @returns {{ path: string, dir: string, within: string, lock: object } | null}
 */
export function lockFor(repo, dir) {
  if (!READ.has(repo)) READ.set(repo, new Map());
  const read = READ.get(repo);
  let at = dir;
  for (;;) {
    const path = at === '' ? LOCK : `${at}/${LOCK}`;
    if (repo.tracked.has(path)) {
      if (!read.has(path)) {
        const text = repo.text(path);
        read.set(path, text == null ? { ok: false, unresolved: 'unreadable' } : readLock(text));
      }
      return { path, dir: at, within: at === '' ? dir : dir.slice(at.length + 1), lock: read.get(path) };
    }
    if (at === '') return null;
    at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '';
  }
}

/**
 * The package a directory under the lock resolves a name to, with what it
 * declares, or null when the lock holds none.
 *
 * @param {object} lock from readLock, ok
 * @param {string} within the directory relative to the lock's, '' for its own
 * @param {string} name
 */
export function packageByName(lock, within, name) {
  for (const base of lookupDirs(within)) {
    const key = `${base === '' ? '' : `${base}/`}node_modules/${name}`;
    const entry = resolvedEntry(lock, key);
    if (entry) return describe(lock, key, entry.entry, entry.key);
  }
  return null;
}

/**
 * The package whose bin a command of that name runs from a directory under
 * the lock: the nearest node_modules that holds a package declaring it, as
 * npm links it into node_modules/.bin. Null when no package does.
 */
export function packageByBin(lock, within, bin) {
  for (const base of lookupDirs(within)) {
    const prefix = `${base === '' ? '' : `${base}/`}node_modules/`;
    const found = [...lock.packages.keys()]
      .filter((key) => key.startsWith(prefix) && isTopLevel(key.slice(prefix.length)))
      .sort()
      .map((key) => ({ key, resolved: resolvedEntry(lock, key) }))
      .find(({ resolved }) => resolved && binsOf(resolved.entry, nameOf(resolved.key, resolved.entry)).includes(bin));
    if (found) return describe(lock, found.key, found.resolved.entry, found.resolved.key);
  }
  return null;
}

/**
 * Every lock entry that lists optional dependencies, with each listed child
 * the lock resolves for it, as Node would from the entry, and the systems a
 * present child declares; a child the lock does not hold is missing.
 *
 * @returns {Array<{ key: string, name: string, version: string|null, line: number|null,
 *   children: Array<{ name: string, present: boolean, key?: string, os?: string[], cpu?: string[] }> }>}
 */
export function optionalBindings(lock) {
  const out = [];
  for (const key of [...lock.packages.keys()].sort()) {
    const entry = lock.packages.get(key);
    if (key === '' || entry.link || !isMapping(entry.optionalDependencies)) continue;
    const children = Object.keys(entry.optionalDependencies).sort().map((child) => {
      const found = childOf(lock, key, child);
      if (!found) return { name: child, present: false };
      return {
        name: child,
        present: true,
        key: found.key,
        ...(listOf(found.entry.os) ? { os: listOf(found.entry.os) } : {}),
        ...(listOf(found.entry.cpu) ? { cpu: listOf(found.entry.cpu) } : {}),
      };
    });
    out.push({ key, name: nameOf(key, entry), version: typeof entry.version === 'string' ? entry.version : null, line: lock.lines.get(key) ?? null, children });
  }
  return out;
}

/** Every package entry of the lock but the root, described. */
export function lockPackages(lock) {
  return [...lock.packages.keys()].filter((key) => key !== '' && !lock.packages.get(key).link).sort()
    .map((key) => describe(lock, key, lock.packages.get(key), key));
}

// What a package entry declares, named by the key it was found at.
function describe(lock, key, entry, at) {
  const engines = isMapping(entry.engines) ? { ...entry.engines } : null;
  return {
    key: at,
    name: nameOf(at, entry),
    version: typeof entry.version === 'string' ? entry.version : null,
    ...(engines ? { engines } : {}),
    bin: binsOf(entry, nameOf(at, entry)),
    ...(entry.optional ? { optional: true } : {}),
    line: lock.lines.get(at) ?? lock.lines.get(key) ?? null,
  };
}

// The directories Node looks in from a directory, the nearest first: each
// one up to the lock's own directory, '' last.
function lookupDirs(within) {
  const out = [];
  let at = within;
  for (;;) {
    if (posix.basename(at) !== 'node_modules') out.push(at);
    if (at === '') return out;
    at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '';
  }
}

// A child an entry resolves: under the entry's own node_modules, then in
// each directory above it, as Node looks.
function childOf(lock, key, child) {
  for (const base of lookupDirs(key)) {
    const found = resolvedEntry(lock, `${base === '' ? '' : `${base}/`}node_modules/${child}`);
    if (found) return found;
  }
  return null;
}

// An entry by its key, followed through a link to the workspace it points at.
function resolvedEntry(lock, key) {
  const entry = lock.packages.get(key);
  if (!entry) return null;
  if (entry.link && typeof entry.resolved === 'string') {
    const target = lock.packages.get(entry.resolved);
    return target ? { key: entry.resolved, entry: target } : null;
  }
  return { key, entry };
}

// node_modules/astro and node_modules/@scope/name are top level under a
// node_modules; node_modules/a/node_modules/b is not.
function isTopLevel(rest) {
  const parts = rest.split('/');
  return parts.length === 1 ? parts[0] !== '' && !parts[0].startsWith('@') && !parts[0].startsWith('.') : parts.length === 2 && parts[0].startsWith('@');
}

function nameOf(key, entry) {
  if (typeof entry.name === 'string' && entry.name !== '') return entry.name;
  const at = key.lastIndexOf('node_modules/');
  return at === -1 ? key : key.slice(at + 'node_modules/'.length);
}

// The command names a package links: bin as an object, or a string named
// for the package without its scope.
function binsOf(entry, name) {
  if (typeof entry.bin === 'string') return [name.replace(/^@[^/]+\//, '')];
  if (isMapping(entry.bin)) return Object.keys(entry.bin).sort();
  return [];
}

function listOf(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return [...value];
  return null;
}

// The line each key of the packages section starts on, as npm writes the
// lock (two-space indent, one key per line). A lock written another way
// names no lines, and its findings name none.
function keyLines(text) {
  const out = new Map();
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === '  "packages": {');
  if (start === -1) return out;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}\}/.test(lines[i])) break;
    const match = /^ {4}("(?:[^"\\]|\\.)*"): \{/.exec(lines[i]);
    if (match) out.set(JSON.parse(match[1]), i + 1);
  }
  return out;
}

function isMapping(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
