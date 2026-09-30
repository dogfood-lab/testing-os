import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pageFacts } from '../adapter/page.js';
import { blobAt, commitOf, distanceFromHead, filesAt, inHistory, isShallow, upstreamOf } from './git.js';

/**
 * The map an answer is read from, checked before any answer is given: each
 * map file that is there parses, the structure has the shape this engine
 * reads, and the commit it was made from is in the history it is read from
 * (this checkout's for atlas/ on disk, the ref's for a map read at a ref). A
 * map that fails any of these halts the answer with the reason; the sidecar
 * never answers from a map it cannot vouch for.
 *
 * A snapshot is read once and kept whole: every answer uses one snapshot,
 * and a refresh replaces the snapshot, never the files under an answer.
 */

const FILES = ['structure.json', 'statistics.json', 'page.json'];
const COMMIT = /^[0-9a-f]{40}$/;

function parsed(text) {
  if (text == null) return { absent: true };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { invalid: true };
  }
}

function readJson(path) {
  return parsed(existsSync(path) ? readFileSync(path, 'utf8') : null);
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * What is wrong with a structure's shape, or null when this engine reads it.
 * Only what every answer leans on is required; a field an older engine did
 * not write is read as absent, not as a broken map.
 */
export function formatProblem(structure) {
  if (!isObject(structure)) return 'structure.json is not an object';
  for (const field of ['boundaries', 'edges', 'doors', 'landings']) {
    if (!Array.isArray(structure[field])) return `structure.json has no ${field} list`;
  }
  if (!isObject(structure.generatedFrom) || !COMMIT.test(String(structure.generatedFrom.commit ?? ''))) {
    return 'structure.json names no commit it was made from';
  }
  for (const boundary of structure.boundaries) {
    if (!isObject(boundary) || typeof boundary.name !== 'string' || !Array.isArray(boundary.files)) return 'a part in structure.json has no name or no file list';
  }
  if (structure.engine != null && typeof structure.engine !== 'string') return 'structure.json names its engine in a form this engine does not read';
  return null;
}

/**
 * The map files as read, checked for what every answer leans on; the history
 * check is the caller's, since where a map was read from decides whose
 * history must hold its commit.
 *
 * @param {Record<string, { absent?: true, invalid?: true, value?: unknown }>} read each map file by name
 * @param {{ id: string, label: string }} identity
 * @param {{ noMap: string }} advice what to do when there is no structure
 */
function checked(read, identity, advice) {
  for (const file of FILES) {
    if (read[file].invalid) {
      return { ok: false, error: { code: 'ATLAS_SIDECAR_MAP_UNREADABLE', details: [`${identity.label}: ${file} is not valid JSON`], whatToDo: 'run atlas map and commit atlas/' } };
    }
  }
  if (read['structure.json'].absent) {
    return { ok: false, error: { code: 'ATLAS_SIDECAR_NO_MAP', details: [`${identity.label}: structure.json is absent`], whatToDo: advice.noMap } };
  }
  const structure = read['structure.json'].value;
  const problem = formatProblem(structure);
  if (problem) {
    return { ok: false, error: { code: 'ATLAS_SIDECAR_MAP_FORMAT', details: [`${identity.label}: ${problem}`], whatToDo: 'run atlas map with this engine and commit atlas/' } };
  }
  return { ok: true, structure };
}

function snapshotOf(read, identity, structure, extra = {}) {
  const statistics = read['statistics.json'].value ?? null;
  const page = read['page.json'].value ?? null;
  const generatedAt = String(page?.generatedAt ?? statistics?.generatedAt ?? '');
  let ctx = null;
  return {
    id: identity.id,
    label: identity.label,
    structure,
    statistics: statistics ?? {},
    page,
    commit: structure.generatedFrom.commit,
    date: generatedAt.slice(0, 10),
    engine: typeof structure.engine === 'string' ? structure.engine : null,
    ...extra,
    // The page's reading of the artifacts, made on first use and kept with
    // the snapshot it was made from.
    get ctx() {
      ctx ??= pageFacts({ structure, statistics: statistics ?? {} });
      return ctx;
    },
  };
}

/**
 * Reads and checks a map held in a directory: atlas/ in the checkout, or a
 * refresh's snapshot in the cache.
 *
 * @param {string} root the repository root, for the history check
 * @param {string} dir the directory holding the map files
 * @param {{ id: string, label: string }} identity how answers name this snapshot
 * @returns {{ ok: true, snapshot: object } | { ok: false, error: { code: string, details: string[], whatToDo: string } }}
 */
export function readSnapshot(root, dir, identity) {
  const read = Object.fromEntries(FILES.map((file) => [file, readJson(join(dir, file))]));
  const map = checked(read, identity, { noMap: 'run atlas init, then atlas map, and commit atlas/' });
  if (!map.ok) return map;
  const commit = map.structure.generatedFrom.commit;
  if (!inHistory(root, commit)) {
    const shallow = isShallow(root);
    return {
      ok: false,
      error: {
        code: 'ATLAS_SIDECAR_MAP_FOREIGN',
        details: [shallow
          ? `${identity.label} was made from ${commit.slice(0, 7)}, which this shallow clone does not hold`
          : `${identity.label} was made from ${commit.slice(0, 7)}, which is not in this checkout's history`],
        whatToDo: shallow ? 'fetch the history (git fetch --unshallow), or run atlas map and commit atlas/' : 'run atlas map and commit atlas/',
      },
    };
  }
  return { ok: true, snapshot: snapshotOf(read, identity, map.structure) };
}

function commits(n) {
  return n === 1 ? '1 commit' : `${n} commits`;
}

/**
 * How far a ref is from this checkout, in words: "4 commits ahead of this
 * checkout", "2 commits behind this checkout", both, or "at this checkout's
 * commit".
 *
 * @param {{ ahead: number|null, behind: number|null }} ref
 */
export function distanceWords({ ahead, behind }) {
  if (ahead == null || behind == null) return 'at a distance from this checkout git could not count';
  if (ahead === 0 && behind === 0) return "at this checkout's commit";
  if (behind === 0) return `${commits(ahead)} ahead of this checkout`;
  if (ahead === 0) return `${commits(behind)} behind this checkout`;
  return `${commits(ahead)} ahead of this checkout and ${behind} behind it`;
}

/**
 * The map on this checkout's fetched upstream (sidecar/git.js upstreamOf),
 * set against the one committed at HEAD by the ids git keeps them under, not
 * by their contents. Null when the checkout has no upstream.
 *
 * @returns {{ name: string, commit: string, ahead: number|null, behind: number|null, holdsMap: boolean, differs: boolean } | null}
 */
export function upstreamMap(root) {
  const upstream = upstreamOf(root);
  if (!upstream) return null;
  const theirs = blobAt(root, upstream.commit, 'atlas/structure.json');
  const ours = blobAt(root, 'HEAD', 'atlas/structure.json');
  const distance = distanceFromHead(root, upstream.commit);
  return {
    name: upstream.name,
    commit: upstream.commit,
    ahead: distance?.ahead ?? null,
    behind: distance?.behind ?? null,
    holdsMap: theirs != null,
    differs: theirs != null && theirs !== ours,
  };
}

/**
 * Whether an answer should say that the upstream holds another map: it holds
 * one that is not the checkout's, and commits the checkout does not have, so
 * its map may be the newer. Atlas never switches to it by itself.
 */
export function newerUpstream(upstream) {
  return upstream != null && upstream.differs && (upstream.ahead ?? 0) > 0;
}

/** The map committed in the checkout, atlas/ in the working tree. */
export function readCommittedMap(root) {
  return readSnapshot(root, join(root, 'atlas'), { id: 'committed', label: 'the committed map' });
}

/**
 * The map a ref holds, read with git and never checked out: atlas/ at the
 * commit the ref names, whose history must hold the commit the map was made
 * from. The snapshot names the ref, its commit, and how far it is from this
 * checkout. Nothing is fetched: a ref is what this clone already holds.
 *
 * @param {string} root
 * @param {string} ref
 * @returns {{ ok: true, snapshot: object } | { ok: false, error: { code: string, details: string[], whatToDo: string } }}
 */
export function readSnapshotAt(root, ref) {
  const commit = commitOf(root, ref);
  if (!commit) {
    return { ok: false, error: { code: 'ATLAS_REF_UNKNOWN', details: [`${ref} names no commit in this clone`], whatToDo: 'name a branch, tag or commit this clone holds, such as origin/main; Atlas never fetches' } };
  }
  const identity = { id: `ref:${commit}`, label: `the map at ${ref}` };
  const bytes = filesAt(root, commit, FILES.map((file) => `atlas/${file}`));
  const read = Object.fromEntries(FILES.map((file) => [file, parsed(bytes.has(`atlas/${file}`) ? bytes.get(`atlas/${file}`).toString('utf8') : null)]));
  const map = checked(read, identity, { noMap: `name a ref whose tree holds atlas/structure.json, or ask without a ref` });
  if (!map.ok) {
    if (map.error.code === 'ATLAS_SIDECAR_NO_MAP') map.error.details = [`${ref} (${commit.slice(0, 7)}) holds no atlas/structure.json`];
    return map;
  }
  const made = map.structure.generatedFrom.commit;
  if (!inHistory(root, made, commit)) {
    return {
      ok: false,
      error: {
        code: 'ATLAS_REF_MAP_FOREIGN',
        details: [`the map at ${ref} (${commit.slice(0, 7)}) was made from ${made.slice(0, 7)}, which is not in the history of ${ref}${isShallow(root) ? ' this shallow clone holds' : ''}`],
        whatToDo: `name a ref whose map was made from its own history, or ask without a ref`,
      },
    };
  }
  const distance = distanceFromHead(root, commit);
  return {
    ok: true,
    snapshot: snapshotOf(read, identity, map.structure, {
      ref: { name: ref, commit, ahead: distance?.ahead ?? null, behind: distance?.behind ?? null },
    }),
  };
}
