import { stringify } from 'yaml';
import { roleFor } from './templates.js';

/**
 * The boundary lines that would give each of `paths` a part
 * (docs/atlas-buildup.spec.md, slice AM, AM-1). A person or agent decides;
 * the lines only spare them working out the glob.
 *
 * A top-level folder no part reaches becomes a part of its own, named for
 * the folder, its role read from every unassigned file the new glob takes.
 * A folder a part already reaches into gains a glob in that part, never a
 * new part, so the suggestion cannot overlap one: the glob is the folder of
 * the new files when at most one part holds files under it, or else each
 * file's own path, escaped, in the part that holds the most files there.
 *
 * @param {{ paths: string[], boundaries: { name: string, files: { path: string }[] }[], unassigned: { path: string }[] }} input
 *   paths: the files to place; boundaries and unassigned: the map of the tree now
 * @returns {{ newParts: { name: string, globs: string[], role: string }[], additions: { part: string, globs: string[] }[], unplaceable: string[] }}
 */
export function suggestBoundaries({ paths, boundaries, unassigned }) {
  const owned = ownersByDirectory(boundaries);
  const names = new Set(boundaries.map((boundary) => boundary.name));
  const loose = unassigned.map((file) => file.path);
  const newParts = [];
  const additions = new Map();
  const unplaceable = [];
  const add = (part, glob) => {
    if (!additions.has(part)) additions.set(part, new Set());
    additions.get(part).add(glob);
  };
  const byTop = groupBy(paths, topOf);
  for (const top of [...byTop.keys()].sort(cmp)) {
    const files = byTop.get(top);
    if (top === '') {
      placeRoot(files, owned, names, loose, newParts, add, unplaceable);
      continue;
    }
    if (!owned.has(top)) {
      const glob = `${escapeGlob(top)}/**`;
      if (names.has(top)) add(top, glob);
      else newParts.push({ name: top, globs: [glob], role: roleFor(loose.filter((path) => path.startsWith(`${top}/`))) });
      continue;
    }
    const byDir = groupBy(files, dirOf);
    for (const dir of [...byDir.keys()].sort(cmp)) {
      const here = owned.get(dir);
      if (!here || here.size === 1) {
        add(here ? [...here.keys()][0] : nearestOwner(dir, owned), `${escapeGlob(dir)}/**`);
        continue;
      }
      placeExactly(byDir.get(dir), busiest(here), add, unplaceable);
    }
  }
  return {
    newParts,
    additions: [...additions.keys()].sort(cmp).map((part) => ({ part, globs: withoutCovered([...additions.get(part)]) })),
    unplaceable: unplaceable.sort(cmp),
  };
}

/**
 * The suggestion as the lines check prints: each block under a heading
 * that says where it goes, indented as atlas/boundaries.yaml is, so the
 * lines can be pasted as they stand.
 */
export function suggestionLines(suggestion) {
  const lines = [];
  for (const part of suggestion.newParts) {
    lines.push('a new part, at the end of boundaries:');
    lines.push(...indented(stringify([part]), '  '));
  }
  for (const { part, globs } of suggestion.additions) {
    lines.push(`in part ${part}, at the end of its globs:`);
    lines.push(...indented(stringify(globs), '      '));
  }
  for (const path of suggestion.unplaceable) lines.push(`no line is suggested for ${path}: give it a part by hand`);
  return lines;
}

export function isEmptySuggestion(suggestion) {
  return suggestion.newParts.length === 0 && suggestion.additions.length === 0 && suggestion.unplaceable.length === 0;
}

// Files at the top level: the glob * takes every one and crosses no
// separator, so it belongs to a part only when no other part holds a file
// there.
function placeRoot(files, owned, names, loose, newParts, add, unplaceable) {
  const here = owned.get('');
  if (!here) {
    const looseHere = loose.filter((path) => !path.includes('/'));
    if (names.has('root')) add('root', '*');
    else newParts.push({ name: 'root', globs: ['*'], role: roleFor(looseHere, { manifest: looseHere.some((path) => MANIFESTS.has(path)) }) });
    return;
  }
  if (here.size === 1) {
    add([...here.keys()][0], '*');
    return;
  }
  placeExactly(files, busiest(here), add, unplaceable);
}

// A folder two parts share takes no folder glob without overlapping one of
// them, so each file is named whole. A name holding a backslash cannot be
// spelled as a glob alike on every platform, so it is left to a person.
function placeExactly(files, part, add, unplaceable) {
  for (const path of files) {
    if (path.includes('\\')) unplaceable.push(path);
    else add(part, escapeGlob(path));
  }
}

// What a repository's manifest is called at its root, as core/index.js
// reads it, for the role of a root part.
const MANIFESTS = new Set(['pyproject.toml', 'Cargo.toml', 'go.mod', 'project.godot', 'package.json']);

/**
 * For each directory, the parts that hold a file under it and how many.
 * The key '' holds the files at the top level alone, which is what the glob
 * * reaches.
 */
function ownersByDirectory(boundaries) {
  const owned = new Map();
  const bump = (dir, name) => {
    if (!owned.has(dir)) owned.set(dir, new Map());
    const counts = owned.get(dir);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  for (const boundary of boundaries) {
    for (const file of boundary.files ?? []) {
      const segments = file.path.split('/');
      if (segments.length === 1) bump('', boundary.name);
      for (let depth = 1; depth < segments.length; depth += 1) bump(segments.slice(0, depth).join('/'), boundary.name);
    }
  }
  return owned;
}

// The part holding the most files under the nearest directory above `dir`
// that any part reaches into. The top-level folder is always reached here.
function nearestOwner(dir, owned) {
  for (let at = dirOf(dir); ; at = dirOf(at)) {
    const here = owned.get(at);
    if (here && at !== '') return busiest(here);
    if (at === '' || !at.includes('/')) {
      const top = owned.get(topOf(dir));
      return busiest(top);
    }
  }
}

function busiest(counts) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0][0];
}

// A glob that sits under another glob the same part gains says nothing more.
function withoutCovered(globs) {
  const folders = globs.filter((glob) => glob.endsWith('/**')).map((glob) => glob.slice(0, -2));
  return globs.filter((glob) => !folders.some((folder) => glob !== `${folder}**` && glob.startsWith(folder))).sort(cmp);
}

// Each character picomatch reads as a pattern, held in a class of its own:
// [*] matches a literal *, and a class means the same on every platform,
// where a backslash escape does not.
function escapeGlob(path) {
  return path.replace(/[*?[\]{}()!+@]/g, (char) => `[${char}]`);
}

function indented(text, prefix) {
  return text.replace(/\n$/, '').split('\n').map((line) => `${prefix}${line}`);
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function topOf(path) {
  return path.includes('/') ? path.slice(0, path.indexOf('/')) : '';
}

function dirOf(path) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

// Code-point order, so the lines are the same on every platform.
function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
