import { fileCounts, structuralChanges } from '../adapter/changes.js';
import { basisOf, byBasis, group } from './answer.js';
import { git } from './git.js';
import { cannotSeeFor, cannotSeeSentence } from './limits.js';
import { formatProblem } from './map.js';

/**
 * atlas_changes: what changed structurally between the map committed at a
 * commit and the map the sidecar answers from, in the same kinds and
 * sentences as the page's "What changed since" section and atlas diff, with
 * nothing cut: the size of the answer, not a fixed count, decides how much
 * is shown, and what is cut says so.
 */

const KINDS = ['cycle', 'import-added', 'import-removed', 'door', 'landing', 'origin', 'sequence', 'part', 'unassigned'];
// How each kind of change is known: an import between parts is read from the
// code, a door, a part and a file's part are stated by a workflow, manifest
// or the boundary file, and an origin and an order of work are read from the
// code. A landing takes the basis of each writer or reader it names.
const BASIS_OF_KIND = {
  cycle: 'parsed',
  'import-added': 'parsed',
  'import-removed': 'parsed',
  door: 'declared',
  origin: 'parsed',
  sequence: 'parsed',
  part: 'declared',
  unassigned: 'declared',
};

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The structure committed at a commit, read with git show; nothing is checked out. */
function readBase(root, since) {
  const resolved = git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${since}^{commit}`]);
  if (!resolved.ok) return { ok: false, details: [`${since} is not a commit in this checkout`] };
  const commit = String(resolved.stdout).trim();
  const shown = git(root, ['show', `${commit}:atlas/structure.json`]);
  if (!shown.ok) return { ok: false, details: [`${since} (${commit.slice(0, 7)}) has no atlas/structure.json`] };
  let structure;
  try {
    structure = JSON.parse(String(shown.stdout));
  } catch {
    return { ok: false, details: [`atlas/structure.json at ${since} (${commit.slice(0, 7)}) is not valid JSON`] };
  }
  const problem = formatProblem(structure);
  if (problem) return { ok: false, details: [`at ${since} (${commit.slice(0, 7)}), ${problem}`] };
  return { ok: true, commit, structure };
}

// A landing item names several writers or readers; each keeps its own basis,
// so an item naming readers known two ways becomes two items, one per basis.
function landingItems(item, current) {
  const [shown, ...bys] = item.subjects;
  const target = shown.endsWith('/') ? shown.slice(0, -1) : shown;
  const side = item.sentence.includes(' written by ') ? 'writers' : 'readers';
  const verb = side === 'writers' ? 'written' : 'read';
  const also = item.sentence.includes(' is now also ') ? 'now also' : 'now';
  const landing = (current.landings ?? []).find((entry) => entry.target === target);
  const basisFor = (by) => basisOf((landing?.[side] ?? []).find((entry) => entry.by === by)?.confidence) ?? 'parsed';
  const byBase = new Map();
  for (const by of bys) byBase.set(basisFor(by), [...(byBase.get(basisFor(by)) ?? []), by]);
  if (byBase.size === 1) return [{ item: { sentence: item.sentence, subjects: item.subjects }, basis: [...byBase.keys()][0] }];
  return [...byBase.entries()].map(([basis, names]) => ({ item: { sentence: `${shown} is ${also} ${verb} by ${list(names)}.`, subjects: [shown, ...names] }, basis }));
}

/**
 * @param {object} snapshot the map the sidecar answers from
 * @param {{ root: string }} repo
 * @param {string} since a commit or ref whose committed map is the base
 */
export function changesAnswer(snapshot, repo, since) {
  const base = readBase(repo.root, since);
  if (!base.ok) return { ok: false, error: { code: 'ATLAS_DIFF_NO_BASE', details: base.details, whatToDo: 'name a commit whose tree holds atlas/structure.json, such as the one before the last map' } };
  const current = snapshot.structure;
  const items = structuralChanges(base.structure, current, { repoPath: repo.root });
  const facts = [];
  for (const kind of KINDS) {
    const ofKind = items.filter((item) => item.kind === kind);
    if (ofKind.length === 0) continue;
    const entries = kind === 'landing'
      ? ofKind.flatMap((item) => landingItems(item, current))
      : ofKind.map((item) => ({ item: { sentence: item.sentence, subjects: item.subjects }, basis: BASIS_OF_KIND[kind] }));
    facts.push(...byBasis(kind, entries));
  }
  const counts = fileCounts(base.structure, current);
  facts.push(group('files', 'declared', [counts]));
  const sentences = [`Atlas: between the map at ${since} (${base.commit.slice(0, 7)}) and ${snapshot.id === 'committed' ? 'the committed map' : snapshot.label} (${snapshot.commit.slice(0, 7)}), ${items.length === 0 ? 'nothing structural changed' : `${items.length} structural ${items.length === 1 ? 'change' : 'changes'}`}.`];
  for (const factGroup of facts) {
    if (factGroup.fact === 'files') continue;
    for (const item of factGroup.items) sentences.push(`Atlas: ${item.sentence}`);
  }
  const terms = [['added', counts.added], ['removed', counts.removed], ['moved', counts.moved], ['changed content', counts.changed]].filter(([, n]) => n > 0);
  sentences.push(`Atlas: ${terms.length === 0 ? 'no file changed' : list(terms.map(([word, n]) => `${n} ${word}`))}${counts.parts > 0 ? `, across ${counts.parts} ${counts.parts === 1 ? 'part' : 'parts'}` : ''}.`);
  // What Atlas cannot see in the parts the changes name.
  const ctx = snapshot.ctx;
  const touched = new Set();
  for (const item of items) {
    for (const subject of item.subjects) {
      const path = subject.endsWith('/') ? subject.slice(0, -1) : subject;
      if (ctx.boundaries.some((boundary) => boundary.name === subject)) touched.add(subject);
      else if (ctx.boundaryOf.has(path)) touched.add(ctx.boundaryOf.get(path));
    }
  }
  const cannotSee = cannotSeeFor(snapshot, { parts: [...touched] });
  sentences.push(...cannotSee.map((entry) => cannotSeeSentence(entry, ctx.shown)));
  return {
    ok: true,
    answer: { question: { since }, base: { commit: base.commit }, facts, cannotSee },
    sentences,
    files: [],
  };
}
