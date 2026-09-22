import { isSourcePath } from '../core/history.js';
import { divergenceHits } from '../core/divergence.js';

export function rowId(repo, hit) {
  if (hit.rule === 'leaks') return `${repo}|leaks|${hit.boundary}`;
  if (hit.rule === 'two-may-be-one') {
    const [left, right] = hit.boundaries;
    return `${repo}|two-may-be-one|${left}|${right}`;
  }
  if (hit.rule === 'file-moved') return `${repo}|file-moved|${hit.boundary}|${hit.file}`;
  return `${repo}|cohesion-dropped|${hit.boundary}`;
}

function openRow(repo, hit, generatedAt, prior, low) {
  const row = {
    id: rowId(repo, hit),
    rule: hit.rule,
    value: hit.value,
    threshold: hit.threshold,
    confidence: low ? 'low' : 'full',
    state: 'open',
    first_seen: prior?.first_seen ?? generatedAt,
    last_seen: generatedAt,
  };
  if (hit.rule === 'leaks') row.boundary = hit.boundary;
  if (hit.rule === 'two-may-be-one') row.boundaries = hit.boundaries;
  if (hit.rule === 'file-moved') {
    row.boundary = hit.boundary;
    row.file = hit.file;
    row.partner_boundary = hit.partner_boundary;
  }
  if (hit.rule === 'cohesion-dropped') {
    row.boundary = hit.boundary;
    row.high_water_mark = hit.high_water_mark;
    row.current = hit.current;
  }
  return row;
}

function clearedRow(prior, low) {
  return {
    id: prior.id,
    rule: prior.rule,
    value: prior.value,
    threshold: prior.threshold,
    confidence: low ? 'low' : prior.confidence,
    state: 'cleared',
    first_seen: prior.first_seen,
    last_seen: prior.last_seen,
    ...(prior.boundary ? { boundary: prior.boundary } : {}),
    ...(prior.boundaries ? { boundaries: prior.boundaries } : {}),
    ...(prior.file ? { file: prior.file } : {}),
    ...(prior.partner_boundary ? { partner_boundary: prior.partner_boundary } : {}),
    ...(prior.high_water_mark != null ? { high_water_mark: prior.high_water_mark } : {}),
    ...(prior.current != null ? { current: prior.current } : {}),
  };
}

export function buildEnvelope({ repo, commit, generatedAt, sharedCommitFloor, hits, previous }) {
  const low = sharedCommitFloor === 3;
  const priorRows = Array.isArray(previous?.rows) ? previous.rows : [];
  const priorById = new Map(priorRows.map((row) => [row.id, row]));
  const seen = new Set();
  const rows = [];
  for (const hit of hits) {
    const row = openRow(repo, hit, generatedAt, priorById.get(rowId(repo, hit)), low);
    seen.add(row.id);
    rows.push(row);
  }
  for (const prior of priorRows) {
    if (prior.state !== 'open' || seen.has(prior.id)) continue;
    rows.push(clearedRow(prior, low));
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    repo,
    generated_from: { commit_sha: commit },
    generated_at: generatedAt,
    shared_commit_floor: sharedCommitFloor,
    confidence: low ? 'low' : 'full',
    rows,
  };
}

export function hitsFromStatistics(statistics, structure) {
  const pairs = (statistics.pairs ?? []).filter((pair) => isSourcePath(pair.a) && isSourcePath(pair.b));
  const boundaries = (structure.boundaries ?? []).map((boundary) => ({
    name: boundary.name,
    files: boundary.files.map((file) => file.path).filter((path) => isSourcePath(path)),
  }));
  return divergenceHits({
    boundaries,
    pairs,
    marks: statistics.boundaries ?? [],
    floor: statistics.parameters?.floor ?? 'strong',
    strengthFloor: statistics.parameters?.strength ?? 0.5,
    drop: statistics.parameters?.cohesionDrop ?? 0.2,
  });
}
