import { isTestFile } from '../core/landings.js';
import { explainTarget, pairFacts } from '../adapter/explain.js';
import { boundaryRoot } from '../adapter/page.js';
import { basisOf, byBasis, firmest, group } from './answer.js';
import { cannotSeeFor, cannotSeeSentence } from './limits.js';

/**
 * atlas_explain: the facts `atlas explain --json` states about one file,
 * directory or part, each in a group of one basis, and what Atlas cannot see
 * for it. The facts are explain's own (adapter/explain.js), so the sidecar
 * and the command line never disagree; what the sidecar adds is how each
 * was known, and the weak facts the page leaves out because it has no way to
 * mark them, here marked weak.
 */

function under(path, place) {
  return path === place || path.startsWith(`${place}/`);
}

// Every raw entry, weak and all, of the landings that relate to a place.
function rawLandings(snapshot) {
  return (snapshot.structure.landings ?? []).filter((landing) => !landing.spans && landing.tracked !== false);
}

// The firmest basis of the entries a file has on the given landings.
function basisBy(landings, side, by) {
  return firmest(landings.flatMap((landing) => (landing[side] ?? []).filter((entry) => entry.by === by).map((entry) => basisOf(entry.confidence))));
}

function stripSlash(place) {
  return place.endsWith('/') ? place.slice(0, -1) : place;
}

/**
 * @param {object} snapshot from sidecar/map.js
 * @param {{ root: string }} repo
 * @param {string} target the path or part name asked about
 * @returns {{ ok: false, error: object } | { ok: true, found: object, facts: object[], cannotSee: object[], sentences: string[], files: string[] }}
 */
export function explainAnswer(snapshot, repo, target) {
  const answer = explainTarget(snapshot, { repo: repo.root, target });
  if (!answer.ok) return { ok: false, error: answer };
  const { facts, found, ctx, lines } = answer;
  const landings = rawLandings(snapshot);
  const members = new Set(found.members);
  const groups = [];

  if (facts.parts) groups.push(group('part', 'declared', facts.parts));
  else if (facts.part) groups.push(group('part', 'declared', [{ part: facts.part, partLabel: facts.partLabel, role: facts.role }]));
  if (found.kind === 'part') {
    groups.push(group('globs', 'declared', facts.globs ?? []));
    if ((facts.entryPoints ?? []).length > 0) groups.push(group('entryPoints', 'declared', facts.entryPoints));
  }

  const doors = facts.doors ?? {};
  if (doors.isDoor) groups.push(group('door', 'declared', [doors.isDoor]));
  for (const field of ['runBy', 'builtBy', 'checkedBy']) if ((doors[field] ?? []).length > 0) groups.push(group(field, 'declared', doors[field]));
  // A door that runs a file of the part reaches it as the workflow says; one
  // that reaches it further in reaches it through imports.
  const onPath = (doors.onPath ?? []).map((name) => {
    const door = ctx.doors.find((entry) => entry.name === name);
    const depth = (door?.reach ?? []).find((entry) => entry.boundary === facts.part)?.depth ?? 0;
    return { item: name, basis: depth === 0 ? 'declared' : 'parsed' };
  });
  groups.push(...byBasis('onPath', onPath));

  if (found.kind === 'file') {
    if ((facts.importsFiles ?? []).length > 0) groups.push(group('importsFiles', 'parsed', facts.importsFiles, { grain: 'file' }));
    if ((facts.reexportsAll ?? []).length > 0) groups.push(group('reexportsAll', 'parsed', facts.reexportsAll, { grain: 'file' }));
    const importers = facts.importedByFiles ?? [];
    const production = importers.filter((path) => !isTestFile(path));
    const tests = importers.filter((path) => isTestFile(path));
    if (production.length > 0) groups.push(group('importedByFiles', 'parsed', production, { grain: 'file' }));
    if (tests.length > 0) groups.push(group('importedByFiles', 'parsed', tests, { grain: 'file', tests: true }));
    // A test named for the file is matched by its name, a guess.
    if ((facts.ownTests ?? []).length > 0) groups.push(group('ownTests', 'weak', facts.ownTests, { grain: 'file' }));
  }
  if ((facts.imports ?? []).length > 0) groups.push(group('imports', 'parsed', facts.imports, { grain: 'part' }));
  if ((facts.importedBy ?? []).length > 0) groups.push(group('importedBy', 'parsed', facts.importedBy, { grain: 'part' }));
  if ((facts.importedByTests ?? []).length > 0) groups.push(group('importedBy', 'parsed', facts.importedByTests, { grain: 'part', tests: true }));

  // What the members write, each place by the firmest way a member writes
  // it, and who reads it, each reader by the firmest way it reads.
  const writes = [];
  const readers = [];
  for (const write of facts.writes ?? []) {
    const place = stripSlash(write.place);
    const writing = landings.filter((landing) => under(landing.target, place) || under(place, landing.target));
    const basis = firmest([...members].map((by) => basisBy(writing, 'writers', by)));
    writes.push({ item: write.place, basis });
    const inside = landings.filter((landing) => under(landing.target, place));
    for (const by of write.readers) {
      const reader = { item: { place: write.place, by }, basis: basisBy(inside, 'readers', by) };
      readers.push(isTestFile(by) || inside.some((landing) => landing.readers.some((entry) => entry.by === by && entry.fromTests)) ? { ...reader, tests: true } : reader);
    }
  }
  // A weak write the page leaves out is a fact here, marked weak.
  const listed = new Set((facts.writes ?? []).map((write) => stripSlash(write.place)));
  for (const landing of landings) {
    if (listed.has(landing.target) || [...listed].some((place) => under(landing.target, place))) continue;
    if ((landing.writers ?? []).some((entry) => members.has(entry.by) && entry.confidence === 'weak')) writes.push({ item: ctx.place(landing.target), basis: 'weak' });
  }
  groups.push(...byBasis('writes', writes));
  groups.push(...byBasis('readersOfWrites', readers.filter((entry) => !entry.tests)));
  groups.push(...byBasis('readersOfWrites', readers.filter((entry) => entry.tests), { tests: true }));

  const reads = (facts.reads ?? []).map((place) => {
    const reading = landings.filter((landing) => under(landing.target, stripSlash(place)));
    return { item: place, basis: firmest([...members].map((by) => basisBy(reading, 'readers', by))) };
  });
  groups.push(...byBasis('reads', reads));

  // Who writes and reads the place asked about: the path itself, or the
  // directory a part is drawn from.
  const boundary = found.kind === 'part' ? ctx.boundaries.find((entry) => entry.name === found.part) : null;
  const placeRoot = found.kind === 'part' ? (boundary ? boundaryRoot(boundary) : null) : found.path;
  const related = (place) => landings.filter((landing) => under(landing.target, place) || under(place, landing.target));
  const writtenBy = (facts.writtenBy ?? []).map((entry) => ({ item: entry, basis: basisBy(related(stripSlash(entry.place)), 'writers', entry.by) }));
  const shownWriters = new Set((facts.writtenBy ?? []).map((entry) => entry.by));
  if (placeRoot != null) {
    for (const landing of related(placeRoot)) {
      for (const entry of landing.writers ?? []) {
        if (entry.confidence !== 'weak' || shownWriters.has(entry.by)) continue;
        writtenBy.push({ item: { by: entry.by, place: ctx.place(landing.target), relation: landing.target === placeRoot ? 'exact' : under(landing.target, placeRoot) ? 'inside' : 'parent' }, basis: 'weak' });
      }
    }
  }
  groups.push(...byBasis('writtenBy', writtenBy));
  const readBy = (facts.readBy ?? []).map((entry) => {
    const reading = placeRoot == null ? landings.filter((landing) => members.has(landing.target)) : landings.filter((landing) => under(landing.target, placeRoot));
    return { item: entry.by, basis: basisBy(reading, 'readers', entry.by), tests: entry.fromTests === true };
  });
  groups.push(...byBasis('readBy', readBy.filter((entry) => !entry.tests)));
  groups.push(...byBasis('readBy', readBy.filter((entry) => entry.tests), { tests: true }));
  if ((facts.writtenByDoors ?? []).length > 0) groups.push(group('writtenByDoors', 'declared', facts.writtenByDoors));

  if (facts.sequence) groups.push(group('sequence', 'parsed', facts.sequence.steps, { grain: 'file' }));
  if ((facts.sequences ?? []).length > 0) groups.push(group('sequences', 'parsed', facts.sequences, { grain: 'file' }));

  // Every pair, where explain's text names the strongest few; the answer's
  // size cuts the list, and says so, when it is long.
  const pairs = pairFacts(ctx, found, Infinity);
  if (pairs.length > 0) {
    const parameters = snapshot.statistics?.parameters ?? {};
    const confidence = snapshot.statistics?.confidence ?? {};
    groups.push(group('changesWith', 'history', pairs, {
      window: { since: parameters.since ?? null, until: parameters.headDate ?? null },
      confidence: { level: confidence.level ?? null, reason: confidence.reason ?? null },
    }));
  }

  const parts = found.kind === 'part' ? [found.part] : (facts.parts ?? []).map((entry) => entry.part).concat(facts.part ? [facts.part] : []);
  const cannotSee = cannotSeeFor(snapshot, { files: found.kind === 'file' ? [found.path] : found.members, parts });

  const weakWrites = writes.filter((entry) => entry.basis === 'weak').map((entry) => entry.item);
  const weakWriters = writtenBy.filter((entry) => entry.basis === 'weak').map((entry) => entry.item.by);
  const sentences = [
    `Atlas: ${lines.slice(0, -1).join(' ')}`,
    ...(weakWrites.length > 0 ? [`Atlas: it may also write ${weakWrites.join(', ')}, a guess from a bare file name (weak).`] : []),
    ...(weakWriters.length > 0 ? [`Atlas: ${weakWriters.join(', ')} may also write it, a guess from a bare file name (weak).`] : []),
    ...cannotSee.map((entry) => cannotSeeSentence(entry, ctx.shown)),
  ];
  const files = found.kind === 'file' ? [found.path] : [];
  return { ok: true, found: { kind: found.kind, path: found.path, part: found.kind === 'part' ? found.part : facts.part ?? null }, facts: groups, cannotSee, sentences, files };
}
