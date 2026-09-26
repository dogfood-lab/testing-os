import { createHash } from 'node:crypto';
import { answered } from './answer.js';
import { asLine, asText } from './data.js';

/**
 * The size of an answer (docs/atlas-sidecar.spec.md, "Every answer is
 * capped"): 8 KB of JSON by default and up to 64 KB with full: true. Lists
 * come most important first. A list cut to fit says so, with complete: false
 * and its count, and a cursor that continues it; a part or a kind narrows the
 * answer before it is cut. No tool returns structure.json, and no answer
 * outgrows the cap, so the map is never returned whole.
 *
 * A model tends to treat a cut list as the whole, and uses worst what sits in
 * the middle of a long input; so the cut is stated in the text's first
 * sentence as well as on every list it touched.
 */

export const CAP = 8 * 1024;
export const FULL_CAP = 64 * 1024;
// The protocol's envelope around a tool result (jsonrpc, id, resultType and
// the server's name in _meta) counts against the cap as well.
const ENVELOPE = 256;
// Room kept for the sentence that says what was cut.
const NOTICE = 640;
// The share of the cap the text may take; the structured answer has the rest.
const TEXT_SHARE = 0.3;
// How many cut lists the first sentence names.
const NAMED_CUTS = 4;
// No one entry takes more than this share of the room.
const ENTRY_SHARE = 6;
// The bytes each list may take in one round of the allocation.
const ROUND_SHARE = 256;

const CURSOR = '^[0-9a-f]{16}:(?:facts|f[0-9]{1,4}|cannotSee|c[0-9]{1,4}[np]|changed|q\\.(?:paths|files)|v\\.(?:fr|rg|st)|p\\.changed):[0-9]{1,7}$';

/** The arguments every answering tool takes for its size, merged into its input schema. */
export const SIZE_PROPERTIES = Object.freeze({
  full: {
    type: 'boolean',
    description: 'Allow an answer of up to 64 KB of JSON instead of 8 KB.',
  },
  part: {
    type: 'string',
    minLength: 1,
    maxLength: 200,
    description: 'Keep only the entries that name a file, a place or the part itself in this part.',
  },
  kind: {
    type: 'string',
    minLength: 1,
    maxLength: 100,
    pattern: '^[A-Za-z]+$',
    description: 'Keep only the facts of this kind, as a fact list names it (importedBy, readBy, doors, runs and the like), or cannotSee for only what Atlas cannot see.',
  },
  cursor: {
    type: 'string',
    minLength: 1,
    maxLength: 64,
    pattern: CURSOR,
    description: 'The cursor of a cut list in an earlier answer to the same question; the answer continues that list where it was cut.',
  },
});

/** What every answering tool's description says of the size of its answers. */
export const SIZE_NOTE = ' An answer is at most 8 KB of JSON, most important first; a list cut to fit says complete: false '
  + 'with its count and a cursor for the rest. full: true allows 64 KB, and part or kind narrows the answer.';

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}

// JSON with every object's keys in order, so equal arguments digest equally.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

/* ---------- importance ---------- */

// What the question is about, stated before anything else.
const LEAD = new Set(['summary', 'asked', 'part', 'globs', 'entryPoints']);
// Facts about doors: what comes in, what it runs, what it reaches and writes.
const DOORS = new Set(['door', 'doors', 'runBy', 'builtBy', 'checkedBy', 'onPath', 'runs', 'checks', 'reachedThrough',
  'passesThrough', 'reaches', 'doorWrites', 'writtenByDoors', 'mainDoor', 'startDoor']);

// Production first, then tests, then what is listed one step out and not followed.
function band(group) {
  if (group.followed === false) return 2;
  return group.tests ? 1 : 0;
}

// Within a band: what the question is, then doors, then files and the rest.
function tier(group) {
  if (LEAD.has(group.fact) || (group.fact === 'parts' && group.basis === 'declared')) return 0;
  return DOORS.has(group.fact) ? 1 : 2;
}

/**
 * The fact groups most important first: production before tests before what
 * is not followed, and within each, what the question is about, then doors,
 * then files; otherwise in the order the tool gave them.
 */
export function orderFacts(facts) {
  return facts.map((group, index) => ({ group, index }))
    .sort((a, b) => band(a.group) - band(b.group) || tier(a.group) - tier(b.group) || a.index - b.index)
    .map((entry) => entry.group);
}

/* ---------- narrowing ---------- */

// The fields of an entry that name a file, a place or a part.
const LOCATED = ['path', 'by', 'file', 'part', 'place', 'target', 'with', 'from', 'to', 'through', 'via'];

function partMatcher(structure, part) {
  const files = new Set();
  const dirs = new Set();
  const add = (path) => {
    files.add(path);
    for (let at = path.indexOf('/'); at !== -1; at = path.indexOf('/', at + 1)) dirs.add(path.slice(0, at));
  };
  for (const boundary of structure.boundaries ?? []) if (boundary.name === part) for (const file of boundary.files ?? []) add(file.path);
  for (const file of structure.overlaps ?? []) if ((file.boundaries ?? []).includes(part)) add(file.path);
  const names = (value) => {
    if (typeof value !== 'string') return false;
    const path = value.endsWith('/') ? value.slice(0, -1) : value;
    return value === part || files.has(path) || dirs.has(path);
  };
  return (item) => {
    if (typeof item === 'string') return names(item);
    if (!item || typeof item !== 'object') return false;
    return LOCATED.some((field) => names(item[field]));
  };
}

/**
 * The answer narrowed to one part, one kind of fact, or both: fact lists keep
 * the entries that name something in the part, and only the facts of the
 * kind; what Atlas cannot see keeps the entries of the part. The answer says
 * what it was narrowed to and how many entries were left out.
 */
function narrow(snapshot, answer, { part, kind }) {
  if (part == null && kind == null) return { answer, sentences: [] };
  const parts = (snapshot.structure.boundaries ?? []).map((boundary) => boundary.name);
  if (part != null && !parts.includes(part)) {
    return {
      error: {
        code: 'ATLAS_SIDECAR_INVALID_ARGUMENTS',
        details: [`the map has no part named ${JSON.stringify(part)}`],
        whatToDo: 'name a part as atlas_overview lists them, or leave part out',
      },
    };
  }
  let left = 0;
  let facts = answer.facts ?? [];
  const kinds = [...new Set(facts.map((group) => group.fact))];
  if (kind === 'cannotSee') {
    left += facts.reduce((sum, group) => sum + group.items.length, 0);
    facts = [];
  } else if (kind != null) {
    left += facts.filter((group) => group.fact !== kind).reduce((sum, group) => sum + group.items.length, 0);
    facts = facts.filter((group) => group.fact === kind);
  }
  let cannotSee = answer.cannotSee ?? [];
  const extra = {};
  if (part != null) {
    const inPart = partMatcher(snapshot.structure, part);
    facts = facts.map((group) => {
      const items = group.items.filter(inPart);
      left += group.items.length - items.length;
      return { ...group, items, total: items.length };
    }).filter((group) => group.items.length > 0);
    const kept = cannotSee.filter((entry) => entry.part === part || [...(entry.named ?? []), ...(entry.places ?? [])].some(inPart));
    left += cannotSee.length - kept.length;
    cannotSee = kept;
    if (Array.isArray(answer.changed)) {
      extra.changed = answer.changed.filter(inPart);
      left += answer.changed.length - extra.changed.length;
    }
  }
  const filter = { ...(part != null ? { part } : {}), ...(kind != null ? { kind } : {}), left };
  const said = [part != null ? `part ${part}` : null, kind != null ? `kind ${kind}` : null].filter(Boolean).join(' and ');
  const sentences = [`Atlas: narrowed to ${said}; ${left === 1 ? '1 entry that does not match is' : `${left} entries that do not match are`} left out.`];
  if (kind != null && kind !== 'cannotSee' && facts.length === 0) {
    sentences.push(`Atlas: this answer has no fact of kind ${kind}; its kinds are ${kinds.length > 0 ? kinds.join(', ') : 'none'}, and cannotSee.`);
  }
  return { answer: { ...answer, ...extra, facts, cannotSee, filter }, sentences };
}

/* ---------- lists ---------- */

function at(root, path) {
  let value = root;
  for (const key of path) {
    if (value == null) return undefined;
    value = value[key];
  }
  return value;
}

/**
 * Every list in a result that can be cut, most important first: the question
 * and the verdict, the changed files, the fact lists of production, what
 * Atlas cannot see, then the fact lists of tests and what is not followed.
 * A fact list carries its marks itself (total, complete, from, cursor); any
 * other list has them beside it, named after it (changedTotal, changedComplete).
 */
function listsOf(root) {
  const lists = [];
  const add = (id, path, style, rank, parent = null) => {
    const items = at(root, path);
    if (Array.isArray(items)) lists.push({ id, path, style, rank, parent, items });
  };
  add('q.paths', ['answer', 'question', 'paths'], 'sibling', 0);
  add('q.files', ['answer', 'question', 'files'], 'sibling', 0);
  add('v.fr', ['answer', 'verdict', 'fullRefresh', 'because'], 'sibling', 0);
  add('v.rg', ['answer', 'verdict', 'regenerate', 'because'], 'sibling', 0);
  add('v.st', ['answer', 'verdict', 'regenerate', 'alsoStale'], 'sibling', 0);
  add('p.changed', ['atlas', 'checkout', 'changed'], 'sibling', 1);
  add('changed', ['answer', 'changed'], 'sibling', 2);
  add('facts', ['answer', 'facts'], 'sibling', 3);
  (root.answer.facts ?? []).forEach((group, index) => {
    add(`f${index}`, ['answer', 'facts', index, 'items'], 'group', (band(group) === 0 ? 10 : 20000) + index, { id: 'facts', index });
  });
  add('cannotSee', ['answer', 'cannotSee'], 'sibling', 10000);
  (root.answer.cannotSee ?? []).forEach((entry, index) => {
    add(`c${index}n`, ['answer', 'cannotSee', index, 'named'], 'sibling', 10001 + index, { id: 'cannotSee', index });
    add(`c${index}p`, ['answer', 'cannotSee', index, 'places'], 'sibling', 10001 + index, { id: 'cannotSee', index });
  });
  return lists.sort((a, b) => a.rank - b.rank);
}

// The result with each list cut to what keep holds for it, and marked.
function build(root, lists, keep, cursorOf) {
  const out = structuredClone(root);
  // Deepest first, so a list is cut before the list that holds it is.
  for (const list of [...lists].sort((a, b) => b.path.length - a.path.length)) {
    const holder = at(out, list.path.slice(0, -1));
    if (!holder) continue;
    const key = list.path[list.path.length - 1];
    const { from, count, omitFirst } = keep.get(list.id);
    // The copy's own list: a list that holds others holds them already cut.
    let shown = holder[key].slice(from, from + count);
    if (omitFirst && shown.length > 0) shown = [{ omitted: 'larger than this answer can hold; full: true allows more', bytes: bytes(shown[0]) }, ...shown.slice(1)];
    holder[key] = shown;
    if (from === 0 && count >= list.items.length) continue;
    const next = from + count < list.items.length ? cursorOf(list.id, from + count) : null;
    if (list.style === 'group') {
      holder.complete = false;
      if (from > 0) holder.from = from;
      if (next) holder.cursor = next;
    } else {
      holder[`${key}Total`] = list.items.length;
      holder[`${key}Complete`] = false;
      if (from > 0) holder[`${key}From`] = from;
      if (next) holder[`${key}Cursor`] = next;
    }
  }
  return out;
}

// The size of the tool result as answer.js sends it.
function resultSize(built, sentences, names) {
  return bytes(answered(built.atlas, built.answer, sentences, names));
}

/**
 * An entry larger than max with its longest lists cut to fit, each cut list
 * marked beside it (<list>Total, <list>Complete false). These lists have no
 * cursor of their own: the entry is one fact, and full: true gives it the
 * room of a larger answer.
 */
function trimEntry(item, max) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || bytes(item) <= max) return item;
  const out = { ...item };
  const inner = Object.keys(out).filter((key) => Array.isArray(out[key]) && out[key].length > 1).sort((a, b) => bytes(out[b]) - bytes(out[a]));
  for (const key of inner) {
    const whole = out[key];
    // An entry that already counts the list (a door's runsCount) keeps that
    // count; otherwise the count goes beside the list.
    const total = `${key}Count` in out ? {} : { [`${key}Total`]: whole.length };
    const cut = (n) => ({ ...out, [key]: whole.slice(0, n), ...total, [`${key}Complete`]: false });
    let low = 1;
    let high = whole.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (bytes(cut(mid)) <= max) low = mid;
      else high = mid - 1;
    }
    Object.assign(out, cut(low));
    if (bytes(out) <= max) break;
  }
  return out;
}

// Whether a list shows in the result: a list inside an entry shows only when
// the list holding that entry keeps it.
function shows(list, keep) {
  if (!list.parent) return true;
  const holder = keep.get(list.parent.id);
  return list.parent.index >= holder.from && list.parent.index < holder.from + holder.count;
}

/**
 * How much of each list the result keeps within the budget: first the list a
 * cursor continues, then the rest of the room to every list in turn, in order
 * of importance.
 */
function allocate(root, lists, budget, sentences, names, target, cursorOf) {
  const keep = new Map(lists.map((list) => [list.id, { from: 0, count: list.items.length, omitFirst: false }]));
  if (target) keep.set(target.id, { from: target.from, count: target.list.items.length - target.from, omitFirst: false });
  // The entry that holds the list a cursor continues (a fact list, or what
  // Atlas cannot see of one entry) is shown first in the list that holds it.
  const holder = target?.list.parent ?? null;
  if (holder) keep.get(holder.id).from = holder.index;
  const size = () => resultSize(build(root, lists, keep, cursorOf), sentences, names);
  if (size() <= budget) return keep;

  const avail = (list) => list.items.length - keep.get(list.id).from;
  // Every list starts empty, counted and continued by a cursor, but the fact
  // lists themselves, and the entry that holds the list a cursor continues.
  const others = lists.filter((list) => list.id !== target?.id && list.id !== 'facts');
  for (const list of others) keep.get(list.id).count = list.id === holder?.id ? 1 : 0;
  if (target) keep.get(target.id).count = 0;
  // An answer whose fact lists alone, empty, outgrow the budget keeps as many
  // lists as fit; the rest are counted and continued by a cursor.
  if (size() > budget) {
    const facts = keep.get('facts');
    if (!facts) return null;
    let low = 0;
    let high = facts.count;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      facts.count = mid;
      if (size() <= budget) low = mid;
      else high = mid - 1;
    }
    facts.count = low;
    if (size() > budget) return null;
  }

  if (target) {
    const own = keep.get(target.id);
    let low = 0;
    let high = avail(target.list);
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      own.count = mid;
      if (size() <= budget) low = mid;
      else high = mid - 1;
    }
    own.count = low;
    // One entry larger than the whole answer is named by its size, so the
    // cursor still moves past it.
    if (own.count === 0 && avail(target.list) > 0) {
      own.count = 1;
      own.omitFirst = true;
      if (size() > budget) {
        own.count = 0;
        own.omitFirst = false;
      }
    }
  }

  // Round by round, each list in order of importance takes its next entries,
  // up to an equal share of bytes a round and at least one, while the room
  // holds them: every list shows its first entries before any list shows
  // many, a list of small entries shows several where a list of large ones
  // shows one, and the more important list takes its turn first. An entry's
  // cost is its own JSON; an entry that holds lists of its own (what Atlas
  // cannot see of a part) is costed as it is shown, its lists cut.
  const costOf = (list, item) => bytes(list.id === 'cannotSee' ? { ...item, named: [], ...(item.places ? { places: [] } : {}) } : item) + 1;
  const added = [];
  let current = size();
  for (let progress = true; progress;) {
    progress = false;
    for (const list of others) {
      if (!shows(list, keep)) continue;
      const own = keep.get(list.id);
      for (let spent = 0; spent < ROUND_SHARE && own.count < avail(list);) {
        const cost = costOf(list, list.items[own.from + own.count]);
        if (current + cost > budget) break;
        own.count += 1;
        current += cost;
        spent += cost;
        added.push(own);
        progress = true;
      }
    }
  }
  // The costs leave out the few bytes a cursor's offset grows by; the last
  // entries taken are given back until the answer fits exactly.
  current = size();
  while (current > budget && added.length > 0) {
    added.pop().count -= 1;
    current = size();
  }
  return keep;
}

/* ---------- text ---------- */

function kib(cap) {
  return `${cap / 1024} KB`;
}

function listName(list, root) {
  if (list.style === 'group') {
    const group = at(root, list.path.slice(0, -1));
    const marks = [group.tests ? 'tests' : null, group.followed === false ? 'not followed' : null, ['parsed', 'declared'].includes(group.basis) ? null : group.basis].filter(Boolean);
    return `${group.fact}${marks.length > 0 ? ` (${marks.join(', ')})` : ''}`;
  }
  const names = { 'q.paths': 'the paths asked', 'q.files': 'the files asked', 'v.fr': 'why a full refresh is needed', 'v.rg': 'why the map must be regenerated', 'v.st': 'what else the change makes stale', 'p.changed': 'the files changed after the map', changed: 'the changed files', facts: 'the fact lists', cannotSee: 'what Atlas cannot see' };
  if (names[list.id]) return names[list.id];
  return list.id.endsWith('n') ? 'names of what Atlas cannot see' : 'places of what Atlas cannot see';
}

// The sentences that fit the text's share, each measured as it is sent, then
// how many were left out.
function fitSentences(line, sentences, budget, names) {
  const kept = [];
  let used = Buffer.byteLength(asLine(line, names));
  for (const sentence of sentences) {
    const cost = Buffer.byteLength(asLine(sentence, names)) + 1;
    if (used + cost > budget) break;
    kept.push(sentence);
    used += cost;
  }
  const dropped = sentences.length - kept.length;
  if (dropped > 0) kept.push(`Atlas: ${dropped === 1 ? '1 more sentence is' : `${dropped} more sentences are`} left out to keep the answer within its size; the structured answer carries every count.`);
  return kept;
}

/* ---------- the answer ---------- */

/**
 * An answer narrowed as asked, its facts most important first, and cut to
 * its cap, or the error a cursor or a part that does not apply makes.
 *
 * @param {{ tool: string, snapshot: object, args: object, atlas: object, answer: object, sentences: string[], names?: RegExp|null }} input
 *   names: the map's names that could read as words, which the text quotes (data.js)
 * @returns {{ atlas: object, answer: object, sentences: string[] } | { error: object }}
 */
export function sizeAnswer({ tool, snapshot, args = {}, atlas, answer, sentences, names = null }) {
  const cap = args.full === true ? FULL_CAP : CAP;
  const narrowed = narrow(snapshot, answer, { part: args.part ?? null, kind: args.kind ?? null });
  if (narrowed.error) return { error: narrowed.error };
  const root = { atlas, answer: { ...narrowed.answer, facts: orderFacts(narrowed.answer.facts ?? []) } };
  const said = [...narrowed.sentences, ...sentences];

  const { cursor, full, ...question } = args;
  const mapDigest = sha(`${snapshot.id}\0${snapshot.commit}\0${snapshot.page?.generatedAt ?? snapshot.statistics?.generatedAt ?? ''}`).slice(0, 8);
  const askedDigest = sha(`${tool}\0${canonical(question)}`).slice(0, 8);
  const cursorOf = (id, offset) => `${mapDigest}${askedDigest}:${id}:${offset}`;
  const lists = listsOf(root);

  let target = null;
  if (cursor != null) {
    const match = /^([0-9a-f]{8})([0-9a-f]{8}):([^:]+):([0-9]+)$/.exec(cursor);
    if (!match) return { error: { code: 'ATLAS_SIDECAR_INVALID_ARGUMENTS', details: ['the cursor is not one Atlas gave'], whatToDo: 'pass a cursor exactly as an earlier answer gave it' } };
    if (match[1] !== mapDigest) {
      return { error: { code: 'ATLAS_SIDECAR_CURSOR_STALE', details: ['the cursor was given for another map than the one answering now'], whatToDo: 'ask again without the cursor, and follow the cursors of the new answer' } };
    }
    if (match[2] !== askedDigest) {
      return { error: { code: 'ATLAS_SIDECAR_INVALID_ARGUMENTS', details: ['the cursor was given for another question'], whatToDo: 'pass the cursor with the same tool and the same arguments as the answer that gave it' } };
    }
    const list = lists.find((entry) => entry.id === match[3]);
    const from = Number(match[4]);
    if (!list || from >= list.items.length) {
      return { error: { code: 'ATLAS_SIDECAR_INVALID_ARGUMENTS', details: ['the cursor names a list this answer does not have'], whatToDo: 'ask again without the cursor' } };
    }
    target = { id: list.id, from, list };
  }

  const budget = cap - ENVELOPE;
  if (!target && resultSize(root, said, names) <= budget) return { atlas: root.atlas, answer: root.answer, sentences: said };

  // An entry too large to share the room (a door that runs hundreds of files)
  // is cut inside before the lists are: its longest lists keep their first
  // entries, each marked beside it as any cut list is.
  const room = budget - NOTICE;
  const cutRoot = structuredClone(root);
  const cutLists = listsOf(cutRoot);
  for (const list of cutLists) {
    if (list.id === 'facts' || list.id === 'cannotSee') continue;
    const holder = at(cutRoot, list.path.slice(0, -1));
    const key = list.path[list.path.length - 1];
    holder[key] = holder[key].map((item) => trimEntry(item, Math.floor(room / ENTRY_SHARE)));
    list.items = holder[key];
  }
  if (target) target = { ...target, list: cutLists.find((entry) => entry.id === target.id) };

  let kept = fitSentences(atlas.line, said, Math.floor(budget * TEXT_SHARE), names);
  let keep = null;
  for (;;) {
    keep = allocate(cutRoot, cutLists, room, kept, names, target, cursorOf);
    if (keep || kept.length <= 1) break;
    kept = fitSentences(atlas.line, said, Buffer.byteLength(asText([atlas.line, ...kept.slice(0, -2)], names)), names);
  }
  if (!keep) return { error: { code: 'ATLAS_SIDECAR_TOO_LARGE', details: [`the smallest form of this answer is over ${kib(cap)}`], whatToDo: 'pass full: true, or narrow the answer with part or kind' } };

  const built = build(cutRoot, cutLists, keep, cursorOf);
  const cut = cutLists.filter((list) => shows(list, keep) && (keep.get(list.id).from > 0 || keep.get(list.id).count < list.items.length));
  const notice = [];
  if (target) {
    const own = keep.get(target.id);
    const end = own.from + own.count;
    notice.push(`Atlas: this answer continues ${listName(target.list, cutRoot)} from entry ${own.from + 1}: entries ${own.from + 1} to ${end} of ${target.list.items.length}${end < target.list.items.length ? '; its cursor fetches the rest' : ', where the list ends'}.`);
  }
  const others = cut.filter((list) => list.id !== target?.id);
  if (others.length > 0) {
    const named = others.slice(0, NAMED_CUTS).map((list) => `${listName(list, cutRoot)} ${keep.get(list.id).count} of ${list.items.length}`);
    const more = others.length > NAMED_CUTS ? ` and ${others.length - NAMED_CUTS} more` : '';
    notice.push(`Atlas: this answer is cut to fit ${kib(cap)}, most important first: ${named.join('; ')}${more}. Each cut list says complete: false with its count and has a cursor for the rest${cap === CAP ? '; full: true allows 64 KB' : ''}, and part or kind narrows the answer.`);
  }
  return { atlas: built.atlas, answer: built.answer, sentences: [...notice, ...kept] };
}
