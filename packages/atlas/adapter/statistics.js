import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_EXTENSIONS, SOURCE_FILE_REACH, SOURCE_FILE_RISE, isSourcePath, loadHistory } from '../core/history.js';

const CHURN_DEFINITION = 'commits is how many commits in the window touch the file, including merges and commits dropped from coupling. lines is added plus deleted in those commits.';
const STRENGTH_DEFINITION = 'strength is the shared qualifying commits divided by either. either is the number of qualifying commits that touch either file.';
const DROP = 0.2;

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parametersFrom(document) {
  const thresholds = document?.thresholds && typeof document.thresholds === 'object' ? document.thresholds : {};
  const window = document?.window;
  return {
    windowDays: typeof window === 'number' ? window : 180,
    pinnedStart: typeof window === 'string' && window.trim() ? window.trim() : null,
    changeset: numberOr(thresholds.changeset, 50),
    changesetFraction: numberOr(thresholds.changesetFraction, 0.25),
    shared: numberOr(thresholds.shared, 10),
    fallenShared: numberOr(thresholds.fallenShared, 3),
    qualifyingMinimum: numberOr(thresholds.qualifyingMinimum, 30),
    strength: numberOr(thresholds.strength, 0.5),
    revisions: numberOr(thresholds.revisions, 5),
  };
}

function boundaryOf(artifact) {
  const map = new Map();
  for (const boundary of artifact.boundaries) {
    for (const file of boundary.files) map.set(file.path, boundary.name);
  }
  return map;
}

function couplingPairs(pairs) {
  return pairs.filter((pair) => isSourcePath(pair.a) && isSourcePath(pair.b));
}

function sourceCommitCounts(boundaries, touches) {
  const counts = new Map();
  for (const boundary of boundaries) {
    const owned = new Set(boundary.files.map((file) => file.path).filter((path) => isSourcePath(path)));
    let count = 0;
    for (const commit of touches) {
      if (commit.paths.some((path) => owned.has(path))) count += 1;
    }
    counts.set(boundary.name, count);
  }
  return counts;
}

function cohesionOf(name, files, pairs, locate) {
  const own = new Set(files.filter((path) => isSourcePath(path)));
  let inside = 0;
  let outside = 0;
  const crossed = new Set();
  for (const pair of pairs) {
    const aIn = own.has(pair.a);
    const bIn = own.has(pair.b);
    if (aIn && bIn) inside += pair.strength;
    else if (aIn || bIn) {
      outside += pair.strength;
      const other = locate.get(aIn ? pair.b : pair.a);
      if (other && other !== name) crossed.add(other);
    }
  }
  const total = inside + outside;
  return { cohesion: total === 0 ? null : round(inside / total), crossed };
}

function breakageFor(fanIn, crossed, usable, confidence) {
  if (!usable) {
    return {
      collapsed: true,
      confidence: 'low',
      importsAndCoChanges: [],
      importsOnly: [...fanIn].sort(),
      coChangesOnly: [],
    };
  }
  const incoming = new Set(fanIn);
  return {
    collapsed: false,
    confidence,
    importsAndCoChanges: [...incoming].filter((name) => crossed.has(name)).sort(),
    importsOnly: [...incoming].filter((name) => !crossed.has(name)).sort(),
    coChangesOnly: [...crossed].filter((name) => !incoming.has(name)).sort(),
  };
}

export function applyMarks(rows, previous, fallen) {
  const prior = new Map((previous?.boundaries ?? []).map((boundary) => [boundary.name, boundary]));
  return rows.map((row) => {
    const old = prior.get(row.name);
    let highWater = old?.highWater ?? null;
    let rebaseline = old?.rebaseline ?? null;
    if (row.requested && row.requested !== rebaseline) rebaseline = row.requested;
    if (row.cohesion == null) highWater = null;
    else if (row.requested && row.requested !== (old?.rebaseline ?? null)) highWater = row.cohesion;
    else if (!fallen && (highWater == null || row.cohesion > highWater)) highWater = row.cohesion;
    const cohesionDropped = !fallen
      && highWater != null
      && row.cohesion != null
      && highWater - row.cohesion >= DROP;
    return {
      name: row.name,
      cohesion: row.cohesion,
      highWater,
      cohesionDropped,
      qualifyingSourceCommits: row.qualifyingSourceCommits ?? 0,
      confidence: row.confidence ?? 'full',
      rebaseline,
      breakage: row.breakage,
    };
  });
}

/**
 * @param {object} input
 * @param {'strong'|'fallen'|null} [input.priorFloor] the floor the previous
 *   map used, so the floor moves with hysteresis (decideFloor); null when
 *   there is no previous map
 */
export function buildStatistics({ repo, commit, document, artifact, generatedAt, priorFloor = null }) {
  const parameters = parametersFrom(document);
  const history = loadHistory(repo, { ...parameters, priorFloor });
  const empty = {
    qualifyingCommits: 0,
    floor: 'fallen',
    floorTrigger: 'thin-history',
    confidenceReason: 'fewer than 30 qualifying commits in the window',
    sourceFilesReachingStrongFloor: 0,
    sharedFloorUsed: parameters.fallenShared,
    appliedChangesetLimit: 0,
    churn: [],
    pairs: [],
    qualifyingTouches: [],
  };
  const measured = history ?? empty;
  const locate = boundaryOf(artifact);
  const fanIn = new Map();
  for (const boundary of artifact.boundaries) fanIn.set(boundary.name, []);
  for (const edge of artifact.edges) {
    if (!fanIn.has(edge.to)) fanIn.set(edge.to, []);
    fanIn.get(edge.to).push(edge.from);
  }
  const usable = measured.qualifyingCommits > 0;
  const confidence = measured.floor === 'strong' ? 'full' : 'low';
  const reason = measured.confidenceReason ?? (confidence === 'full'
    ? 'at least 30 qualifying commits, and at least 20 source files reach 10 revisions'
    : 'fewer than 30 qualifying commits in the window');
  const population = couplingPairs(measured.pairs);
  const sourceCommits = sourceCommitCounts(artifact.boundaries, measured.qualifyingTouches ?? []);
  const rows = artifact.boundaries.map((boundary) => {
    const facts = cohesionOf(boundary.name, boundary.files.map((file) => file.path), population, locate);
    const qualifyingSourceCommits = sourceCommits.get(boundary.name) ?? 0;
    return {
      name: boundary.name,
      cohesion: facts.cohesion,
      qualifyingSourceCommits,
      confidence: qualifyingSourceCommits < parameters.qualifyingMinimum ? 'low' : 'full',
      requested: document.boundaries.find((item) => item.name === boundary.name)?.rebaseline ?? null,
      breakage: breakageFor(fanIn.get(boundary.name) ?? [], facts.crossed, usable, confidence),
    };
  });
  let previous = null;
  const priorPath = join(repo, 'atlas', 'statistics.json');
  if (existsSync(priorPath)) {
    try {
      previous = JSON.parse(readFileSync(priorPath, 'utf8'));
    } catch {
      previous = null;
    }
  }
  return {
    generatedAt,
    generatedFrom: { commit },
    parameters: {
      windowDays: parameters.pinnedStart ? null : parameters.windowDays,
      pinnedStart: parameters.pinnedStart,
      couplingPopulation: 'source',
      sourceExtensions: [...SOURCE_EXTENSIONS],
      sourceFileReach: SOURCE_FILE_REACH,
      sourceFileRise: SOURCE_FILE_RISE,
      sourceFilesReachingStrongFloor: measured.sourceFilesReachingStrongFloor ?? 0,
      floorTrigger: measured.floorTrigger ?? null,
      floorHeld: measured.floorHeld ?? false,
      priorFloor: priorFloor === 'strong' || priorFloor === 'fallen' ? priorFloor : null,
      changeset: parameters.changeset,
      changesetFraction: parameters.changesetFraction,
      shared: parameters.shared,
      fallenShared: parameters.fallenShared,
      qualifyingMinimum: parameters.qualifyingMinimum,
      strength: parameters.strength,
      revisions: parameters.revisions,
      cohesionDrop: DROP,
      inScopeFiles: history?.inScope ?? 0,
      appliedChangesetLimit: measured.appliedChangesetLimit,
      qualifyingCommits: measured.qualifyingCommits,
      floor: measured.floor,
      sharedFloorUsed: measured.sharedFloorUsed,
      since: history?.since ?? null,
      headDate: history?.headDate ?? null,
    },
    confidence: { level: confidence, reason },
    churn: { definition: CHURN_DEFINITION, files: measured.churn },
    strengthDefinition: STRENGTH_DEFINITION,
    pairs: measured.pairs,
    boundaries: applyMarks(rows, previous, measured.floor === 'fallen').sort((a, b) => (a.name < b.name ? -1 : 1)),
  };
}

export function statisticsProblem(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return 'atlas/statistics.json has no date';
  }
  if (!json || typeof json.generatedAt !== 'string' || json.generatedAt.trim() === '') {
    return 'atlas/statistics.json has no date';
  }
  return null;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

export function serializeStatistics(statistics) {
  const text = JSON.stringify(sortKeys(statistics), null, 2);
  return text.endsWith('\n') ? text : `${text}\n`;
}
