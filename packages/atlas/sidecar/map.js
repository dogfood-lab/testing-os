import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pageFacts } from '../adapter/page.js';
import { inHistory } from './git.js';

/**
 * The map an answer is read from, checked before any answer is given: each
 * map file that is there parses, the structure has the shape this engine
 * reads, and the commit it was made from is in this checkout's history. A
 * map that fails any of these halts the answer with the reason; the sidecar
 * never answers from a map it cannot vouch for.
 *
 * A snapshot is read once and kept whole: every answer uses one snapshot,
 * and a refresh replaces the snapshot, never the files under an answer.
 */

const FILES = ['structure.json', 'statistics.json', 'page.json'];
const COMMIT = /^[0-9a-f]{40}$/;

function readJson(path) {
  if (!existsSync(path)) return { absent: true };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return { invalid: true };
  }
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
 * Reads and checks a map held in a directory: atlas/ in the checkout, or a
 * refresh's snapshot in the cache.
 *
 * @param {string} root the repository root, for the history check
 * @param {string} dir the directory holding the map files
 * @param {{ id: string, label: string }} identity how answers name this snapshot
 * @returns {{ ok: true, snapshot: object } | { ok: false, error: { code: string, details: string[], whatToDo: string } }}
 */
export function readSnapshot(root, dir, identity) {
  const read = {};
  for (const file of FILES) {
    const result = readJson(join(dir, file));
    if (result.invalid) {
      return { ok: false, error: { code: 'ATLAS_SIDECAR_MAP_UNREADABLE', details: [`${identity.label}: ${file} is not valid JSON`], whatToDo: 'run atlas map and commit atlas/' } };
    }
    read[file] = result;
  }
  if (read['structure.json'].absent) {
    return { ok: false, error: { code: 'ATLAS_SIDECAR_NO_MAP', details: [`${identity.label}: structure.json is absent`], whatToDo: 'run atlas init, then atlas map, and commit atlas/' } };
  }
  const structure = read['structure.json'].value;
  const problem = formatProblem(structure);
  if (problem) {
    return { ok: false, error: { code: 'ATLAS_SIDECAR_MAP_FORMAT', details: [`${identity.label}: ${problem}`], whatToDo: 'run atlas map with this engine and commit atlas/' } };
  }
  const commit = structure.generatedFrom.commit;
  if (!inHistory(root, commit)) {
    return {
      ok: false,
      error: {
        code: 'ATLAS_SIDECAR_MAP_FOREIGN',
        details: [`${identity.label} was made from ${commit.slice(0, 7)}, which is not in this checkout's history`],
        whatToDo: 'fetch the full history if the clone is shallow, or run atlas map and commit atlas/',
      },
    };
  }
  const statistics = read['statistics.json'].value ?? null;
  const page = read['page.json'].value ?? null;
  const generatedAt = String(page?.generatedAt ?? statistics?.generatedAt ?? '');
  let ctx = null;
  return {
    ok: true,
    snapshot: {
      id: identity.id,
      label: identity.label,
      structure,
      statistics: statistics ?? {},
      page,
      commit,
      date: generatedAt.slice(0, 10),
      engine: typeof structure.engine === 'string' ? structure.engine : null,
      // The page's reading of the artifacts, made on first use and kept with
      // the snapshot it was made from.
      get ctx() {
        ctx ??= pageFacts({ structure, statistics: statistics ?? {} });
        return ctx;
      },
    },
  };
}

/** The map committed in the checkout, atlas/ in the working tree. */
export function readCommittedMap(root) {
  return readSnapshot(root, join(root, 'atlas'), { id: 'committed', label: 'the committed map' });
}
