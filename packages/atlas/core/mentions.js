import { posix } from 'node:path';
import { isCodePath } from './languages.js';
import { isSmokeTest, isTestFile } from './test-names.js';

/**
 * The code files a test names in a string, by a way the map cannot follow
 * to an import or a run: run_py('tool_a.py') through a conftest helper that
 * joins it to a directory built at run time, join(ROOT, 'scripts',
 * 'gen.mjs') with a root imported from another file, python3
 * tools/tool_c.py in a smoke script. The map cannot tell whether such a test
 * runs the file, reads it or only mentions it, so a file a test names is
 * never said to be one no test reaches (docs/atlas-test-gaps.spec.md,
 * "Reach, defined"): it is named, by text.
 */

// Where a word of a string ends: a space, a quote, or what separates the
// parts of an expression or a command line.
const SEPARATORS = /[\s"'`=,;:()[\]{}<>|&*?!$]+/;
// A test-shaped file among fixtures is data a test reads, and names nothing.
const FIXTURE_DIRS = /(^|\/)(fixtures|__fixtures__|testdata)\//;
const SHELL = /\.(sh|bash|ps1)$/;

/** Whether a file's strings are read for the code files they name. */
export function namesFiles(path) {
  return (isTestFile(path) || isSmokeTest(path)) && !FIXTURE_DIRS.test(path);
}

/** Whether a file is a shell script read as text for the files it names. */
export function isShellScript(path) {
  return SHELL.test(path);
}

// The words of one string that end in a code file's name.
function wordsOf(text) {
  return text.split(SEPARATORS).filter((word) => word !== '' && isCodePath(word));
}

/**
 * The words of a test's strings that end in a code file's name, in a
 * JavaScript, TypeScript or Python tree. The specifier of an import is an
 * import, read as one; a docstring, or a string standing alone as a
 * statement, is prose.
 *
 * @param {string} language
 * @param {object} root the tree's root node
 * @returns {string[]}
 */
export function stringWords(language, root) {
  const out = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'string' || node.type === 'template_string') {
      if (!isImportSource(node) && !standsAlone(node)) for (const word of wordsOf(inner(language, node.text))) out.add(word);
      continue;
    }
    for (const child of node.namedChildren) stack.push(child);
  }
  return [...out].sort();
}

// The text between a string's quotes, its prefix letters left out.
function inner(language, text) {
  if (language === 'python') return text.replace(/^[A-Za-z]*("""|'''|"|')/, '').replace(/("""|'''|"|')$/, '');
  return text.slice(1, -1);
}

function isImportSource(node) {
  const parent = node.parent;
  if (parent == null) return false;
  if (parent.type === 'import_statement' || parent.type === 'export_statement') return true;
  // require('./x.js') and import('./x.js') load what they name.
  if (parent.type === 'arguments') {
    const callee = parent.parent?.childForFieldName('function');
    return callee?.type === 'import' || callee?.text === 'require';
  }
  return false;
}

// 'use strict', or a Python docstring: a string that is a statement alone.
function standsAlone(node) {
  return node.parent?.type === 'expression_statement' && node.parent.namedChildren.length === 1;
}

/**
 * The words of a shell script that end in a code file's name, comments left
 * out: python3 tools/tool_c.py --dry.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function shellWords(text) {
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    const code = line.replace(/(^|\s)#.*$/, '');
    for (const word of wordsOf(code)) out.add(word);
  }
  return [...out].sort();
}

/**
 * Each test's words, read as the code files they name: a path from the
 * test's own directory, a path from the root or the end of one only one
 * file's path ends with, or a file name only one file has. A test names
 * none of the files it imports or runs, and no test or fixture.
 *
 * @param {Map<string, object>} files every file of the map, by path; each
 *   test's `mentions` are read and dropped, and `names` set
 */
export function settleMentions(files) {
  const code = [...files.keys()].filter((path) => isCodePath(path) && !namesFiles(path) && !isTestFile(path) && !FIXTURE_DIRS.test(path));
  const known = new Set(code);
  const byName = new Map();
  for (const path of code) {
    const name = posix.basename(path);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(path);
  }
  for (const [path, file] of files) {
    const words = file.mentions;
    delete file.mentions;
    if (!words || words.length === 0) continue;
    const own = new Set([...(file.spawns ?? []), ...(Array.isArray(file.imports) ? file.imports : []).filter((site) => site.resolved?.outcome === 'file').map((site) => site.resolved.path)]);
    const named = new Set();
    for (const word of words) {
      const target = fileNamed(word, path, known, byName);
      if (target != null && target !== path && !own.has(target)) named.add(target);
    }
    if (named.size > 0) file.names = [...named].sort();
  }
}

function fileNamed(word, from, known, byName) {
  const plain = word.replaceAll('\\', '/').replace(/^\/+/, '');
  if (plain === '') return null;
  const candidates = byName.get(posix.basename(plain)) ?? [];
  if (candidates.length === 0) return null;
  if (!plain.includes('/')) return candidates.length === 1 ? candidates[0] : null;
  const here = posix.normalize(posix.join(posix.dirname(from), plain));
  if (known.has(here)) return here;
  const tail = plain.replace(/^(\.\.?\/)+/, '');
  if (known.has(tail)) return tail;
  const ending = candidates.filter((path) => path.endsWith(`/${tail}`));
  return ending.length === 1 ? ending[0] : null;
}
