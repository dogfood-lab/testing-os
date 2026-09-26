import { ENGINE } from '../adapter/engine.js';
import { ERRORS } from '../adapter/errors.js';

/**
 * What every answer carries (docs/atlas-sidecar.spec.md, "Every answer
 * carries"): the provenance, in one line and as fields; a basis on every
 * fact, with the classes never merged in one list; and what Atlas cannot see
 * for the question. The text is Atlas's own voice: the instrument named,
 * third person, no opinion.
 */

export const BASES = Object.freeze(['parsed', 'declared', 'text', 'weak', 'history', 'unresolved', 'outside']);
export const WHERES = Object.freeze(['caller', 'home', 'temporary', 'untracked', 'another-repository', 'http']);

// The engine's confidence on a writer or reader, and the basis it is.
const BY_CONFIDENCE = Object.freeze({ ast: 'parsed', config: 'declared', text: 'text', weak: 'weak' });
// A file that reads one place several ways is known by the firmest way.
const FIRMNESS = ['parsed', 'declared', 'text', 'weak'];

/** @returns {'parsed'|'declared'|'text'|'weak'|null} */
export function basisOf(confidence) {
  return BY_CONFIDENCE[confidence] ?? null;
}

/** The firmest of the bases given: parsed, then declared, then text, then weak. */
export function firmest(bases) {
  let best = null;
  for (const basis of bases) if (basis != null && (best == null || FIRMNESS.indexOf(basis) < FIRMNESS.indexOf(best))) best = basis;
  return best;
}

/**
 * One fact, or one list of facts of one kind, all known one way.
 *
 * @param {string} fact what the items are
 * @param {string} basis one of BASES
 * @param {unknown[]} items
 * @param {object} [extra] grain, tests, window, confidence, source, and the like
 */
export function group(fact, basis, items, extra = {}) {
  if (!BASES.includes(basis)) throw new Error(`atlas sidecar: ${basis} is not a basis`);
  return { fact, basis, items: [...items], total: items.length, complete: true, ...extra };
}

/**
 * Items of one fact split by the basis each carries, one group per basis in
 * the order of FIRMNESS; items with no basis are dropped, never merged in.
 *
 * @param {string} fact
 * @param {Array<{ item: unknown, basis: string }>} entries
 * @param {object} [extra]
 */
export function byBasis(fact, entries, extra = {}) {
  const out = [];
  for (const basis of FIRMNESS) {
    const items = entries.filter((entry) => entry.basis === basis).map((entry) => entry.item);
    if (items.length > 0) out.push(group(fact, basis, items, extra));
  }
  return out;
}

function short(commit) {
  return String(commit ?? '').slice(0, 7);
}

function version(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? ''));
  return match ? match.slice(1, 4).map(Number) : null;
}

/**
 * How the engine that made a map compares with the engine answering:
 * 'same', 'older', 'newer', or 'unknown' for a map made before maps named
 * their engine (or one naming a version that is no version).
 */
export function engineAge(mapEngine) {
  const made = version(mapEngine);
  const answering = version(ENGINE);
  if (!made || !answering) return 'unknown';
  for (let i = 0; i < 3; i += 1) {
    if (made[i] < answering[i]) return 'older';
    if (made[i] > answering[i]) return 'newer';
  }
  return 'same';
}

/**
 * What an answer says first about how fresh its map is: when an older or a
 * newer engine made it, or none it names, and when files in the answer
 * changed after it; each names the refresh where a refresh would help.
 */
export function freshnessSentences(snapshot, changed) {
  const out = [];
  const age = engineAge(snapshot.engine);
  if (age === 'unknown') out.push(`Atlas: the map does not name the engine that made it, so it was made before maps recorded one; atlas_refresh re-maps the checkout with this engine (${ENGINE}).`);
  else if (age === 'older') out.push(`Atlas: the map was made by Atlas ${snapshot.engine}, an older engine than this one (${ENGINE}); atlas_refresh re-maps the checkout with this engine.`);
  else if (age === 'newer') out.push(`Atlas: the map was made by Atlas ${snapshot.engine}, newer than this engine (${ENGINE}); it may state facts this engine does not read.`);
  if (changed.length > 0) {
    const files = changed.length === 1 ? '1 file' : `${changed.length} files`;
    out.push(`Atlas: ${files} in this answer changed after the map, so what the map says of ${changed.length === 1 ? 'it' : 'them'} is from before the change; atlas_refresh re-maps the checkout.`);
  }
  return out;
}

function changeWords(entry) {
  if (entry.committed && entry.uncommitted) return 'committed, and changed again uncommitted';
  return entry.committed ? 'committed' : 'uncommitted';
}

// How many changed files the provenance line names; the fields carry all.
const CHANGED_NAMED = 3;

/**
 * The provenance an answer carries: the engine answering, the map (which
 * snapshot, its commit, date and the engine that made it), and the checkout
 * (its root, HEAD, and each file in the answer that changed after the map).
 *
 * @param {{ repo?: { root: string, from: string }|null, snapshot?: object|null, head?: string|null, changed?: object[] }} input
 */
export function provenance({ repo = null, snapshot = null, head = null, changed = [] } = {}) {
  const atlas = { engine: ENGINE };
  const parts = [`Atlas ${ENGINE}`];
  if (snapshot) {
    atlas.map = { snapshot: snapshot.id, commit: snapshot.commit, date: snapshot.date, engine: snapshot.engine, engineAge: engineAge(snapshot.engine) };
    const by = snapshot.engine ? `made by Atlas ${snapshot.engine}` : 'made by an Atlas that did not record its version';
    const name = snapshot.id === 'committed' ? 'map' : snapshot.label;
    parts.push(`${name} ${short(snapshot.commit)}, ${snapshot.date || 'undated'}, ${by}`);
  }
  if (repo) {
    atlas.checkout = { root: repo.root, rootFrom: repo.from, head, changed, changedTotal: changed.length };
    if (head) parts.push(`HEAD ${short(head)}`);
    if (changed.length > 0) {
      const named = changed.slice(0, CHANGED_NAMED).map((entry) => `${entry.path} changed after the map (${changeWords(entry)})`);
      const more = changed.length > CHANGED_NAMED ? ` and ${changed.length - CHANGED_NAMED} more files changed after the map` : '';
      parts.push(`${named.join('; ')}${more}`);
    }
  }
  atlas.line = parts.join(' · ');
  return atlas;
}

/**
 * A tool result: one text block in Atlas's voice, and the same facts as
 * structured content.
 */
export function answered(atlas, answer, sentences) {
  return {
    content: [{ type: 'text', text: [atlas.line, ...sentences].join('\n') }],
    structuredContent: { atlas, answer },
  };
}

/** A tool result for a failure, in Atlas's error shape. */
export function failed(atlas, { code, details, whatToDo }) {
  const error = { code, sentence: ERRORS[code], whatChanged: [...details], whatToDo };
  const text = [
    atlas.line,
    `Atlas cannot answer: ${error.sentence} (${code})`,
    `What changed: ${error.whatChanged.length > 0 ? error.whatChanged.join('; ') : 'nothing listed'}.`,
    `What to do: ${whatToDo}.`,
  ].join('\n');
  return { content: [{ type: 'text', text }], structuredContent: { atlas, error }, isError: true };
}

/* ---------- schemas ---------- */

export const PROVENANCE_SCHEMA = {
  type: 'object',
  properties: {
    engine: { type: 'string' },
    map: {
      type: 'object',
      properties: {
        snapshot: { type: 'string' },
        commit: { type: 'string' },
        date: { type: 'string' },
        engine: { type: ['string', 'null'] },
        engineAge: { type: 'string', enum: ['same', 'older', 'newer', 'unknown'] },
      },
      required: ['snapshot', 'commit', 'date', 'engine', 'engineAge'],
    },
    checkout: {
      type: 'object',
      properties: {
        root: { type: 'string' },
        rootFrom: { type: 'string', enum: ['client root', 'working directory'] },
        head: { type: ['string', 'null'] },
        changed: {
          type: 'array',
          items: {
            type: 'object',
            properties: { path: { type: 'string' }, committed: { type: 'boolean' }, uncommitted: { type: 'boolean' } },
            required: ['path', 'committed', 'uncommitted'],
          },
        },
        changedTotal: { type: 'integer', minimum: 0 },
      },
      required: ['root', 'rootFrom', 'head', 'changed', 'changedTotal'],
    },
    line: { type: 'string' },
  },
  required: ['engine', 'line'],
};

export const FACT_GROUP_SCHEMA = {
  type: 'object',
  properties: {
    fact: { type: 'string' },
    basis: { type: 'string', enum: [...BASES] },
    items: { type: 'array' },
    total: { type: 'integer', minimum: 0 },
    complete: { type: 'boolean' },
    cursor: { type: 'string' },
    grain: { type: 'string', enum: ['file', 'part'] },
    tests: { type: 'boolean' },
    followed: { type: 'boolean' },
    window: { type: 'object' },
    confidence: { type: 'object' },
    source: { type: 'string', enum: ['map', 're-read'] },
    file: { type: 'string' },
  },
  required: ['fact', 'basis', 'items', 'total', 'complete'],
};

export const CANNOT_SEE_SCHEMA = {
  type: 'object',
  properties: {
    basis: { type: 'string', enum: ['unresolved', 'outside'] },
    what: { type: 'string', enum: ['import', 'read', 'write', 'command', 'file', 'call', 'dispatch'] },
    grain: { type: 'string', enum: ['file', 'part', 'door'] },
    count: { type: 'integer', minimum: 0 },
    where: { type: 'string', enum: [...WHERES] },
    part: { type: 'string' },
    reason: { type: 'string' },
    named: { type: 'array' },
    places: { type: 'array', items: { type: 'string' } },
    source: { type: 'string', enum: ['map', 're-read'] },
  },
  required: ['basis', 'what', 'grain', 'count', 'named'],
};
