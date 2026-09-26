import { basisOf, byBasis, firmest, group } from './answer.js';
import { capped } from './data.js';
import { cannotSeeFor, cannotSeeSentence } from './limits.js';

/**
 * atlas_overview: what the repository is, what comes in (every door, its
 * trigger, what it runs and what it sends), the main flow, and where to
 * start reading, from the committed page's data (page.json) and the
 * structure it was written from. A door, its triggers, runs and sends are
 * stated by a workflow or a manifest; how far a door reaches past the files
 * it runs, and the order of work, are read from the code.
 */

const RUNS_NAMED = 6;

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function doorKey(door) {
  return door.kind === 'command' || door.kind === 'package' || door.kind === 'action' ? `${door.file}#${door.name}` : door.file;
}

/**
 * @param {object} snapshot from sidecar/map.js
 * @returns {{ ok: false, error: object } | { ok: true, answer: object, sentences: string[], files: string[] }}
 */
export function overviewAnswer(snapshot) {
  const { page, structure } = snapshot;
  if (!page || !Array.isArray(page.doors)) {
    return { ok: false, error: { code: 'ATLAS_SIDECAR_MAP_FORMAT', details: [`${snapshot.label}: page.json is absent or holds no doors`], whatToDo: 'run atlas map with this engine and commit atlas/' } };
  }
  const ctx = snapshot.ctx;
  const byKey = new Map((structure.doors ?? []).map((door) => [doorKey(door), door]));
  const facts = [];

  if (typeof page.summary === 'string' && page.summary !== '') facts.push(group('summary', 'declared', [page.summary]));
  facts.push(group('parts', 'declared', ctx.boundaries.map((boundary) => ({
    part: boundary.name,
    partLabel: ctx.shown(boundary.name),
    role: boundary.role ?? null,
    files: (boundary.files ?? []).length,
  }))));

  facts.push(group('doors', 'declared', page.doors.map((door) => ({
    name: door.name,
    file: door.file,
    ...(door.kind ? { kind: door.kind } : {}),
    triggers: [...(door.triggers ?? [])],
    runs: [...(door.runs ?? [])],
    runsCount: door.runsCount ?? (door.runs ?? []).length,
    checks: [...(door.checks ?? [])],
    sends: [...(door.sends ?? [])],
    stages: [...(door.stages ?? [])],
  }))));

  // How far each door reaches: the parts of the files it runs, as the
  // workflow states them, and the parts further in, through imports.
  const reaches = page.doors.flatMap((door) => (door.reach ?? []).map((entry) => ({
    item: { door: door.name, part: entry.boundary, depth: entry.depth },
    basis: entry.depth === 0 ? 'declared' : 'parsed',
  })));
  facts.push(...byBasis('reaches', reaches, { grain: 'part' }));

  // What each door writes, by the firmest way a writer of the place is known:
  // a workflow's own shell states it, code the door runs is parsed.
  const writes = [];
  for (const door of page.doors) {
    const source = byKey.get(door.id ?? doorKey(door));
    for (const place of source?.landings ?? []) {
      const writers = (structure.landings ?? []).find((entry) => entry.target === place)?.writers ?? [];
      const own = writers.find((entry) => entry.by === door.file);
      const basis = own ? basisOf(own.confidence) : firmest(writers.filter((entry) => entry.confidence !== 'weak').map((entry) => basisOf(entry.confidence)));
      if (basis) writes.push({ item: { door: door.name, place: ctx.place(place) }, basis });
    }
  }
  facts.push(...byBasis('doorWrites', writes));

  const main = page.doors.find((door) => (door.id ?? doorKey(door)) === page.mainDoor);
  if (main) facts.push(group('mainDoor', 'declared', [{ name: main.name, file: main.file }]));
  if ((page.sequences ?? []).length > 0) {
    facts.push(group('mainFlow', 'parsed', page.sequences.map((sequence) => ({ file: sequence.file, entry: sequence.entry, steps: sequence.steps ?? [] })), { grain: 'file' }));
  }
  const start = page.doors.find((door) => (door.id ?? doorKey(door)) === page.startDoor);
  if (start) facts.push(group('startDoor', 'declared', [{ name: start.name, file: start.file }]));
  const chain = (page.startHere ?? []).filter((path) => path !== start?.file);
  if (chain.length > 0) facts.push(group('startHere', 'parsed', chain, { grain: 'file' }));

  const cannotSee = cannotSeeFor(snapshot, { parts: ctx.boundaries.map((boundary) => boundary.name), doors: structure.doors ?? [] });

  const sentences = [];
  if (typeof page.summary === 'string' && page.summary !== '') sentences.push(`Atlas: the boundary file's summary, written by a person, reads: ${JSON.stringify(capped(page.summary))}`);
  if (page.derived) sentences.push(`Atlas: ${page.derived}`);
  for (const door of page.doors) {
    const runs = door.runs ?? [];
    const more = (door.runsCount ?? runs.length) - Math.min(runs.length, RUNS_NAMED);
    const running = runs.length === 0 ? 'runs no file the map can see' : `runs ${list(runs.slice(0, RUNS_NAMED))}${more > 0 ? ` and ${more} more` : ''}`;
    const starts = (door.triggers ?? []).length > 0 ? `starts ${door.triggers.join('; ')}; it ` : '';
    const sends = (door.sends ?? []).length > 0 ? `; it ${list(door.sends)}` : '';
    sentences.push(`Atlas: ${door.name} (${door.file}) ${starts}${running}${sends}.`);
  }
  if (main) sentences.push(`Atlas: the main flow is ${main.name}, the door whose reach covers the most parts.`);
  for (const sequence of page.sequences ?? []) {
    const steps = (sequence.steps ?? []).map((step) => `${step.phrase}${step.part ? ` (${step.partLabel ?? step.part})` : ''}`);
    if (steps.length > 0) sentences.push(`Atlas: inside ${sequence.file}, ${sequence.phrase ?? sequence.entry} does, in order: ${list(steps)}.`);
  }
  if ((page.startHere ?? []).length > 0) sentences.push(`Atlas: to follow it end to end, read in this order: ${page.startHere.join(' → ')}.`);
  sentences.push(...cannotSee.map((entry) => cannotSeeSentence(entry, ctx.shown)));

  return {
    ok: true,
    answer: { question: {}, facts, cannotSee },
    sentences,
    files: [],
  };
}
