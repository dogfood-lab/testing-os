import { statSync } from 'node:fs';
import { join } from 'node:path';

const FLOOR = 100;

/**
 * Compare a committed artifact to the one just derived.
 * An overlap is reported before a glob mismatch: editing the boundary file
 * so two globs claim one file is ATLAS_OVERLAP, which a glob-equality check
 * would hide as a generic drift.
 */
export function compareArtifacts(committed, current, repoPath) {
  committed = {
    boundaries: committed.boundaries ?? [],
    edges: committed.edges ?? [],
    overlaps: committed.overlaps ?? [],
    submodules: committed.submodules ?? [],
    unassigned: committed.unassigned ?? [],
  };
  const overlap = overlapFailure(current);
  if (overlap) return overlap;
  const identity = boundaryIdentity(committed, current);
  if (identity) return identity;
  const empty = emptyBoundary(current);
  if (empty) return empty;
  const edges = setDrift('edge', edgeKey, committed.edges, current.edges, (edge) => `${edge.from} → ${edge.to} (${edge.kind})`);
  if (edges) return edges;
  const entries = entryDrift(committed, current);
  if (entries) return entries;
  const unresolved = unresolvedDrift(committed, current);
  if (unresolved) return unresolved;
  const unassigned = unassignedDrift(committed, current, repoPath);
  if (unassigned) return unassigned;
  const moved = moveDrift(committed, current, repoPath);
  if (moved) return moved;
  return setDrift('submodule', (name) => name, committed.submodules, current.submodules, (name) => name, 'submodule');
}

function overlapFailure(current) {
  if (current.overlaps.length === 0) return null;
  return {
    code: 'ATLAS_OVERLAP',
    details: current.overlaps.map((overlap) => `${overlap.path} is in ${overlap.boundaries.join(' and ')}`),
  };
}

function boundaryIdentity(committed, current) {
  const details = [];
  const oldNames = new Set(committed.boundaries.map((boundary) => boundary.name));
  const newNames = new Set(current.boundaries.map((boundary) => boundary.name));
  for (const name of [...oldNames].sort()) {
    if (!newNames.has(name)) details.push(`boundary ${name} vanished`);
  }
  for (const name of [...newNames].sort()) {
    if (!oldNames.has(name)) details.push(`boundary ${name} is new`);
  }
  const oldByName = new Map(committed.boundaries.map((boundary) => [boundary.name, boundary]));
  for (const boundary of current.boundaries) {
    const old = oldByName.get(boundary.name);
    if (!old) continue;
    if (old.role !== boundary.role) {
      details.push(`${boundary.name} role is ${boundary.role}; the committed map says ${old.role}`);
    }
    if (listsDiffer(sorted(old.globs), sorted(boundary.globs))) details.push(`${boundary.name} globs changed`);
    if (old.importConfidence !== boundary.importConfidence) {
      details.push(`${boundary.name} import confidence was ${old.importConfidence} and is ${boundary.importConfidence}`);
    }
  }
  if (details.length === 0) return null;
  return { code: 'ATLAS_STRUCTURE_DRIFT', details };
}

function emptyBoundary(current) {
  const names = current.boundaries.filter((boundary) => boundary.files.length === 0).map((boundary) => boundary.name);
  if (names.length === 0) return null;
  return { code: 'ATLAS_BOUNDARY_EMPTY', details: names.map((name) => `${name} matches no files`) };
}

function entryDrift(committed, current) {
  const details = [];
  const oldByName = new Map(committed.boundaries.map((boundary) => [boundary.name, boundary]));
  for (const boundary of current.boundaries) {
    const old = oldByName.get(boundary.name);
    if (!old) continue;
    if (listsDiffer(sorted(old.entryPoints), sorted(boundary.entryPoints))) {
      details.push(`${boundary.name} entry points were ${showList(old.entryPoints)} and are ${showList(boundary.entryPoints)}`);
    }
  }
  if (details.length === 0) return null;
  return { code: 'ATLAS_STRUCTURE_DRIFT', details };
}

function unresolvedDrift(committed, current) {
  const details = [];
  const oldByName = new Map(committed.boundaries.map((boundary) => [boundary.name, boundary]));
  for (const boundary of current.boundaries) {
    const old = oldByName.get(boundary.name);
    if (!old) continue;
    if (old.unresolvedSites !== boundary.unresolvedSites) {
      details.push(`${boundary.name} unresolved sites were ${old.unresolvedSites} and are ${boundary.unresolvedSites}`);
    }
  }
  if (details.length === 0) return null;
  return { code: 'ATLAS_STRUCTURE_DRIFT', details };
}

export function unassignedDrift(committed, current, repoPath) {
  const old = new Map(committed.unassigned.map((file) => [file.path, file.hash]));
  const pardons = new Map();
  for (const [path, hash] of old) {
    if (current.unassigned.some((file) => file.path === path)) continue;
    pardons.set(hash, (pardons.get(hash) ?? 0) + 1);
  }
  const offenders = [];
  for (const file of current.unassigned) {
    if (old.has(file.path)) continue;
    const size = fileSize(repoPath, file.path);
    if (size >= FLOOR && (pardons.get(file.hash) ?? 0) > 0) {
      pardons.set(file.hash, pardons.get(file.hash) - 1);
      continue;
    }
    offenders.push(file.path);
  }
  if (offenders.length === 0) return null;
  return { code: 'ATLAS_UNASSIGNED_NEW', details: offenders };
}

function moveDrift(committed, current, repoPath) {
  const old = roster(committed);
  const now = roster(current);
  const details = [];
  const disappeared = [];
  for (const [path, entry] of old) {
    if (!now.has(path)) disappeared.push({ ...entry, path });
  }
  for (const [path, entry] of now) {
    const same = old.get(path);
    if (same) {
      if (same.boundary !== entry.boundary) {
        details.push(`${path} was in ${same.boundary} and is in ${entry.boundary}`);
      }
      continue;
    }
    if (fileSize(repoPath, path) < FLOOR) continue;
    const matches = disappeared.filter((item) => item.hash === entry.hash);
    const boundaries = new Set(matches.map((item) => item.boundary));
    if (boundaries.size !== 1) continue;
    const from = [...boundaries][0];
    if (from !== entry.boundary) details.push(`${path} was in ${from} and is in ${entry.boundary}`);
  }
  if (details.length === 0) return null;
  return { code: 'ATLAS_FILE_MOVED', details };
}

function roster(artifact) {
  const map = new Map();
  for (const boundary of artifact.boundaries) {
    for (const file of boundary.files) map.set(file.path, { hash: file.hash, boundary: boundary.name });
  }
  return map;
}

function setDrift(noun, keyOf, oldList, newList, show) {
  const oldKeys = new Set(oldList.map(keyOf));
  const newKeys = new Set(newList.map(keyOf));
  const details = [];
  for (const item of newList) {
    if (!oldKeys.has(keyOf(item))) details.push(`new ${show(item)}`);
  }
  for (const item of oldList) {
    if (!newKeys.has(keyOf(item))) details.push(`vanished ${show(item)}`);
  }
  if (details.length === 0) return null;
  return { code: 'ATLAS_STRUCTURE_DRIFT', details };
}

function edgeKey(edge) {
  return `${edge.from}\0${edge.to}\0${edge.kind}`;
}

function sorted(list = []) {
  return [...list].sort();
}

function listsDiffer(left = [], right = []) {
  if (left.length !== right.length) return true;
  return left.some((item, index) => item !== right[index]);
}

function showList(list) {
  return list.length === 0 ? '(none)' : list.join(', ');
}

function fileSize(repoPath, path) {
  try {
    return statSync(join(repoPath, path)).size;
  } catch {
    return 0;
  }
}
