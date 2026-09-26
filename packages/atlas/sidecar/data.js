/**
 * Repository text is data (docs/atlas-sidecar.spec.md, "Safety"). Every
 * string an answer's structured content carries is capped in length. In the
 * text a model reads, a name taken from the repository cannot pass for
 * Atlas's own words: a name that could read as words of its own (one with a
 * space, a quote, a backslash or a control character) is quoted as a JSON
 * string wherever the text names it, and control, format and line-break
 * characters show as escapes, so no repository text starts a line of its
 * own or hides in one. A line break
 * left once the names are quoted is Atlas's own (the order of work explain
 * lists one step to a line), and is folded into a space, so every line of the
 * text is one sentence of Atlas's.
 *
 * Every step is idempotent: a quoted name is not quoted again, a folded line
 * has no break left, and an escape holds no control character, so the size
 * of an answer can be measured on its text as it will be sent.
 */

/** The most characters a string in an answer's structured content holds. */
export const DATA_CAP = 512;

// Characters that break a line, move the cursor, reorder the text or hide in it.
// Written as code points: a line separator typed into a pattern ends the line.
const CONTROL_RANGES = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f],
  [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]];
const CONTROL_CLASS = `[${CONTROL_RANGES.map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join('')}]`;
const CONTROL = new RegExp(CONTROL_CLASS, 'gu');
// A name that could read as words of its own, or leave its place in a line:
// one with a space, a quote, a backslash or a control character. A glob's
// stars and brackets cannot, so a place spelled as a glob is shown as it is.
const WORDLIKE = new RegExp(`[\\s"'\`\\\\]|${CONTROL_CLASS}`, 'u');
const PLAIN_MAX = 200;
// The words a cut string ends with, counted into its cap.
const CUT_ROOM = 40;

/** A string cut to the cap, saying how many characters were cut. */
export function capped(text, max = DATA_CAP) {
  if (typeof text !== 'string' || text.length <= max) return text;
  let keep = max - CUT_ROOM;
  // Never half of a surrogate pair.
  if (/[\ud800-\udbff]/.test(text[keep - 1])) keep -= 1;
  return `${text.slice(0, keep)}… (${text.length - keep} more characters)`;
}

/** Every string in a value capped; the keys are Atlas's own. */
export function capStrings(value) {
  if (typeof value === 'string') return capped(value);
  if (Array.isArray(value)) return value.map(capStrings);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, capStrings(item)]));
  return value;
}

/** A line with every control, format and line-break character shown as an escape. */
export function neutral(line) {
  return line.replace(CONTROL, (char) => {
    if (char === '\n') return '\\n';
    if (char === '\r') return '\\r';
    if (char === '\t') return '\\t';
    return `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`;
  });
}

function unplain(value) {
  return typeof value === 'string' && value !== '' && (WORDLIKE.test(value) || value.length > PLAIN_MAX);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NAMES = new WeakMap();

// A path that could read as words, with those of its directories and its base
// name, which a sentence may name alone.
function addPathTo(found, path) {
  if (!unplain(path)) return;
  found.add(path);
  const parts = path.split('/');
  for (const name of [parts[parts.length - 1], ...parts.map((_, end) => parts.slice(0, end).join('/'))]) {
    if (unplain(name)) found.add(name);
  }
}

// One pattern that finds the longest name first, or null when there is none.
function patternOf(names) {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  return sorted.length > 0 ? new RegExp(sorted.map(escapeRegExp).join('|'), 'gu') : null;
}

/**
 * The names a map holds that could read as words of their own: part and door
 * names, files with their directories and base names, places, what the
 * imports that do not resolve name, and the summary. Kept per map.
 *
 * @param {{ structure: object, page?: object|null }} snapshot
 * @returns {{ found: Set<string>, pattern: RegExp|null }}
 */
function mapNames(snapshot) {
  const { structure } = snapshot;
  if (NAMES.has(structure)) return NAMES.get(structure);
  const found = new Set();
  const add = (value) => {
    if (unplain(value)) found.add(value);
  };
  const addPath = (path) => addPathTo(found, path);
  for (const boundary of structure.boundaries ?? []) {
    add(boundary.name);
    for (const file of boundary.files ?? []) addPath(file.path);
    for (const entry of boundary.unresolvedNamed ?? []) {
      add(entry.specifier);
      addPath(entry.path);
    }
    for (const name of boundary.externalNames ?? []) add(name);
  }
  for (const file of [...(structure.unassigned ?? []), ...(structure.overlaps ?? [])]) addPath(file.path);
  for (const door of structure.doors ?? []) {
    add(door.name);
    addPath(door.file);
  }
  for (const landing of structure.landings ?? []) addPath(landing.target);
  add(snapshot.page?.summary);
  for (const door of snapshot.page?.doors ?? []) add(door.name);
  const names = { found, pattern: patternOf(found) };
  NAMES.set(structure, names);
  return names;
}

// The fields of an entry that hold a path, which may name a file the map
// has never seen: one a change added, read again.
const PATH_FIELDS = ['path', 'file', 'by', 'place', 'target', 'via', 'through', 'with'];

/**
 * The names the text of an answer quotes, as one pattern, or null when there
 * are none: the map's names that could read as words of their own, and any such
 * path in the answer's facts that the map does not hold.
 *
 * @param {{ structure: object, page?: object|null }} snapshot
 * @param {object} [answer]
 * @returns {RegExp|null}
 */
export function unplainNames(snapshot, answer = null) {
  const known = mapNames(snapshot);
  const extra = new Set();
  const fresh = (path) => {
    if (typeof path === 'string' && !known.found.has(path)) addPathTo(extra, path);
  };
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      for (const field of PATH_FIELDS) fresh(value[field]);
      // A fact list of files lists them as strings.
      if (value.grain === 'file' && Array.isArray(value.items)) value.items.forEach(fresh);
      Object.values(value).forEach(visit);
    }
  };
  if (answer) visit([answer.facts ?? [], answer.cannotSee ?? [], answer.changed ?? []]);
  return extra.size === 0 ? known.pattern : patternOf([...known.found, ...extra]);
}

function quoteNames(line, pattern) {
  return line.replace(pattern, (match, offset, whole) => {
    // A name the sentence quoted itself is left as it is.
    if (whole[offset - 1] === '"' && whole[offset + match.length] === '"') return match;
    return JSON.stringify(capped(match));
  });
}

/**
 * One line of an answer's text, as it is sent: every name the pattern finds
 * quoted, every line break left folded into a space with the indent after
 * it, and every other control character shown as an escape.
 *
 * @param {string} line
 * @param {RegExp|null} [pattern] from unplainNames
 */
export function asLine(line, pattern = null) {
  const quoted = pattern ? quoteNames(line, pattern) : line;
  return neutral(quoted.replace(/[ \t]*\r?\n[ \t]*/g, ' '));
}

/** The text of an answer: its lines, each as asLine sends it. */
export function asText(lines, pattern = null) {
  return lines.map((line) => asLine(line, pattern)).join('\n');
}
