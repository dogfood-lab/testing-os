import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storedBytes, textAttributes } from '../core/text.js';
import { git, head } from './git.js';

/**
 * Whether the files an answer names changed after the map it was read from:
 * committed since the map's commit (git diff --name-only <commit> HEAD),
 * uncommitted in the working tree or the index (git status), or both.
 *
 * A map is often made on a working tree and committed with the change it
 * describes, so a file git lists as changed since the map's commit may be
 * exactly what the map recorded. The map keeps each file's hash as git
 * stores it; a committed change whose bytes the map already holds is not a
 * change after the map.
 *
 * Every git command here only reads, with GIT_OPTIONAL_LOCKS=0 (sidecar/git.js):
 * a git status that refreshed .git/index would write the checkout it reads.
 */

function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

/**
 * @param {string} root
 * @param {string} commit the commit the map was made from
 * @returns {{ head: string|null, committed: Set<string>, uncommitted: Map<string, string> }}
 *   uncommitted maps a path to its two-letter git status (' M', 'A ', 'D ', '??')
 */
export function checkoutState(root, commit) {
  const at = head(root);
  const committed = new Set();
  if (at && at !== commit) {
    const diff = git(root, ['diff', '--name-only', '-z', '--no-renames', commit, at, '--']);
    if (diff.ok) for (const path of String(diff.stdout).split('\0')) if (path && !inAtlas(path)) committed.add(path);
  }
  const uncommitted = new Map();
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  if (status.ok) {
    for (const entry of String(status.stdout).split('\0')) {
      if (entry.length < 4) continue;
      const path = entry.slice(3);
      if (!inAtlas(path)) uncommitted.set(path, entry.slice(0, 2));
    }
  }
  return { head: at, committed, uncommitted };
}

/** Every tracked file of a map with the hash it recorded. */
export function mapHashes(structure) {
  const out = new Map();
  for (const boundary of structure.boundaries ?? []) for (const file of boundary.files ?? []) out.set(file.path, file.hash);
  for (const file of [...(structure.unassigned ?? []), ...(structure.overlaps ?? [])]) out.set(file.path, file.hash);
  return out;
}

/**
 * A file's bytes hashed as the map hashes a file (as git stores it), read
 * from the working tree, or from HEAD when the working tree holds an edit on
 * top of it; null when there is no such file.
 */
function hashAt(root, path, attributes, fromHead) {
  let bytes = null;
  if (fromHead) {
    const shown = git(root, ['show', `HEAD:${path}`], { encoding: 'buffer' });
    if (shown.ok) bytes = shown.stdout;
  } else if (existsSync(join(root, path))) {
    try {
      bytes = readFileSync(join(root, path));
    } catch {
      bytes = null;
    }
  }
  return bytes == null ? null : createHash('sha256').update(storedBytes(bytes, attributes.get(path))).digest('hex');
}

/**
 * The paths among those given that changed after the map, in the order
 * given, each with whether the change is committed, uncommitted, or both.
 *
 * @param {string} root
 * @param {{ structure: object }} snapshot
 * @param {{ committed: Set<string>, uncommitted: Map<string, string> }} state from checkoutState
 * @param {string[]} paths
 * @returns {Array<{ path: string, committed: boolean, uncommitted: boolean }>}
 */
export function changedFiles(root, snapshot, state, paths) {
  const hashes = mapHashes(snapshot.structure);
  // A committed change is one the map does not already hold: a file whose
  // bytes still hash to what the map recorded was mapped as it is now.
  const settled = new Map();
  const heldByMap = (path) => {
    if (!settled.has(path)) settled.set(path, hashes.has(path) && hashAt(root, path, attributes(), state.uncommitted.has(path)) === hashes.get(path));
    return settled.get(path);
  };
  let cached = null;
  const attributes = () => {
    cached ??= textAttributes(root, [...hashes.keys()].filter((path) => path === '.gitattributes' || path.endsWith('/.gitattributes') || state.committed.has(path)));
    return cached;
  };
  // A directory changed when a file under it did.
  const under = (keys, path) => [...keys].filter((key) => key === path || key.startsWith(`${path}/`));
  const out = [];
  for (const path of [...new Set(paths)].filter((item) => !inAtlas(item))) {
    const uncommitted = under(state.uncommitted.keys(), path).length > 0;
    const committed = under(state.committed, path).some((key) => !heldByMap(key));
    if (committed || uncommitted) out.push({ path, committed, uncommitted });
  }
  return out;
}
