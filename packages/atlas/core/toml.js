/**
 * A TOML reader for the manifests Atlas reads whole (Cargo.toml): tables,
 * arrays of tables, dotted and quoted keys, strings of all four kinds,
 * arrays and inline tables, nested to any depth. Numbers, booleans and dates
 * are kept as the text they are written as, which is all a caller compares.
 * A document it cannot read is read up to the line that stops it: what the
 * manifest declared before that line is still what it declares.
 *
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseToml(text) {
  const root = {};
  let table = root;
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const at = { i: 0 };
  while (at.i < source.length) {
    skipBlank(source, at);
    if (at.i >= source.length) break;
    try {
      if (source[at.i] === '[') {
        const array = source[at.i + 1] === '[';
        at.i += array ? 2 : 1;
        const keys = readKeys(source, at, ']');
        at.i += array ? 2 : 1;
        table = array ? appendTable(root, keys) : openTable(root, keys);
      } else {
        const keys = readKeys(source, at, '=');
        at.i += 1;
        skipSpaces(source, at);
        const value = readValue(source, at);
        assign(table, keys, value);
      }
      skipToLineEnd(source, at);
    } catch {
      break;
    }
  }
  return root;
}

function isTable(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

// A key already holding a value of another shape is left as it is: the
// document says two things of it, and the first stands.
function openTable(root, keys) {
  let node = root;
  for (const key of keys) {
    let next = node[key];
    if (Array.isArray(next) && next.length > 0 && isTable(next[next.length - 1])) next = next[next.length - 1];
    if (!isTable(next)) {
      if (next !== undefined) throw new Error('table redefines a value');
      next = {};
      node[key] = next;
    }
    node = next;
  }
  return node;
}

function appendTable(root, keys) {
  const parent = openTable(root, keys.slice(0, -1));
  const last = keys[keys.length - 1];
  if (parent[last] === undefined) parent[last] = [];
  if (!Array.isArray(parent[last])) throw new Error('array of tables redefines a value');
  const entry = {};
  parent[last].push(entry);
  return entry;
}

function assign(table, keys, value) {
  const parent = openTable(table, keys.slice(0, -1));
  const last = keys[keys.length - 1];
  if (parent[last] !== undefined) return;
  parent[last] = value;
}

function readKeys(source, at, end) {
  const keys = [];
  for (;;) {
    skipSpaces(source, at);
    const ch = source[at.i];
    if (ch === '"' || ch === "'") keys.push(readString(source, at));
    else {
      const match = /^[A-Za-z0-9_-]+/.exec(source.slice(at.i, at.i + 256));
      if (!match) throw new Error('key expected');
      keys.push(match[0]);
      at.i += match[0].length;
    }
    skipSpaces(source, at);
    if (source[at.i] === '.') {
      at.i += 1;
      continue;
    }
    if (source[at.i] !== end) throw new Error(`${end} expected`);
    return keys;
  }
}

function readValue(source, at) {
  const ch = source[at.i];
  if (ch === '"' || ch === "'") return readString(source, at);
  if (ch === '[') return readArray(source, at);
  if (ch === '{') return readInline(source, at);
  const match = /^[^\s,\]}#]+/.exec(source.slice(at.i));
  if (!match) throw new Error('value expected');
  at.i += match[0].length;
  return match[0];
}

function readArray(source, at) {
  at.i += 1;
  const out = [];
  for (;;) {
    skipBlank(source, at);
    if (source[at.i] === ']') {
      at.i += 1;
      return out;
    }
    out.push(readValue(source, at));
    skipBlank(source, at);
    if (source[at.i] === ',') at.i += 1;
    else if (source[at.i] !== ']') throw new Error('] expected');
  }
}

function readInline(source, at) {
  at.i += 1;
  const out = {};
  for (;;) {
    skipSpaces(source, at);
    if (source[at.i] === '}') {
      at.i += 1;
      return out;
    }
    const keys = readKeys(source, at, '=');
    at.i += 1;
    skipSpaces(source, at);
    assign(out, keys, readValue(source, at));
    skipSpaces(source, at);
    if (source[at.i] === ',') at.i += 1;
    else if (source[at.i] !== '}') throw new Error('} expected');
  }
}

const ESCAPES = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };

function readString(source, at) {
  const quote = source[at.i];
  const multi = source.startsWith(quote.repeat(3), at.i);
  at.i += multi ? 3 : 1;
  if (multi && source[at.i] === '\n') at.i += 1;
  let out = '';
  while (at.i < source.length) {
    const ch = source[at.i];
    if (multi ? source.startsWith(quote.repeat(3), at.i) : ch === quote) {
      at.i += multi ? 3 : 1;
      return out;
    }
    if (!multi && ch === '\n') throw new Error('unterminated string');
    if (quote === '"' && ch === '\\') {
      const next = source[at.i + 1];
      if (next === 'u' || next === 'U') {
        const width = next === 'u' ? 4 : 8;
        out += String.fromCodePoint(Number.parseInt(source.slice(at.i + 2, at.i + 2 + width), 16) || 0xfffd);
        at.i += 2 + width;
      } else if (multi && next === '\n') {
        at.i += 2;
        while (/\s/.test(source[at.i] ?? '')) at.i += 1;
      } else {
        out += ESCAPES[next] ?? next;
        at.i += 2;
      }
      continue;
    }
    out += ch;
    at.i += 1;
  }
  throw new Error('unterminated string');
}

function skipSpaces(source, at) {
  while (source[at.i] === ' ' || source[at.i] === '\t') at.i += 1;
}

// Spaces, line breaks and comments, which may stand between the items of an
// array and between the lines of a document.
function skipBlank(source, at) {
  for (;;) {
    while (/\s/.test(source[at.i] ?? '')) at.i += 1;
    if (source[at.i] !== '#') return;
    while (at.i < source.length && source[at.i] !== '\n') at.i += 1;
  }
}

function skipToLineEnd(source, at) {
  skipSpaces(source, at);
  if (source[at.i] === '#') while (at.i < source.length && source[at.i] !== '\n') at.i += 1;
  if (at.i < source.length && source[at.i] !== '\n') throw new Error('line end expected');
}
