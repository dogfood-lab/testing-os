import { extname, posix } from 'node:path';
import picomatch from 'picomatch';
import { boundaryRoot } from './entry-points.js';
import { isWorkflow } from './doors.js';

// The destination argument of each write call. A rename or copy lands on its
// second argument; the first is where the bytes came from.
const JS_WRITES = new Map([
  ['writeFileSync', 0],
  ['writeFile', 0],
  ['appendFileSync', 0],
  ['appendFile', 0],
  ['mkdirSync', 0],
  ['mkdir', 0],
  ['createWriteStream', 0],
  ['renameSync', 1],
  ['rename', 1],
  ['copyFileSync', 1],
  ['copyFile', 1],
]);
// A wrapper named for what it wraps (atomicWriteFileSync, stageWriteFile) is
// read as that call. The suffix must follow a lowercase letter, so the wrapper
// is a longer camelCase name and not the call itself spelled differently.
const JS_WRITE_SUFFIX = /[a-z](WriteFileSync|WriteFile|AppendFileSync|AppendFile)$/;
const JS_READS = new Set(['readFileSync', 'readFile', 'readdirSync', 'readdir', 'existsSync', 'statSync', 'createReadStream']);
// Calls whose path names a directory, made or listed. Any other call names a
// file, and a file that is not tracked is still that file (landingOf).
const DIRECTORY_CALLS = new Set([
  'mkdirSync',
  'mkdir',
  'readdirSync',
  'readdir',
  'os.makedirs',
  'os.mkdir',
  'os.listdir',
  'os.scandir',
  'glob.glob',
  'iterdir',
  'glob',
  'rglob',
]);
const JS_OPEN = new Set(['open', 'openSync']);
const NETWORK = new Set(['fetch', 'get']);
const JS_PATH_MODULES = new Set(['path', 'posix', 'win32', 'path.posix', 'path.win32']);
const JS_FUNCTIONS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'function',
  'generator_function',
  'arrow_function',
  'method_definition',
]);
const JS_BLOCKS = new Set(['program', 'statement_block', 'class_static_block']);

const PY_OS_WRITES = new Map([
  ['makedirs', 0],
  ['mkdir', 0],
  ['rename', 1],
  ['replace', 1],
]);
const PY_SHUTIL_WRITES = new Set(['copy', 'copy2', 'copyfile', 'move']);
const PY_RECEIVER_WRITES = new Set(['write_text', 'write_bytes']);
const PY_RECEIVER_READS = new Set(['read_text', 'read_bytes', 'iterdir', 'glob', 'rglob']);
const PY_JOIN = new Set(['os.path.join', 'path.join', 'posixpath.join', 'join']);
const PY_PATH = new Set([
  'Path',
  'PurePath',
  'PosixPath',
  'PurePosixPath',
  'pathlib.Path',
  'pathlib.PurePath',
  'pathlib.PosixPath',
  'pathlib.PurePosixPath',
]);
const PY_DIRNAME = new Set(['os.path.dirname', 'path.dirname', 'dirname']);
// Methods of a path that return a path: evalPy follows each.
const PY_PATH_METHODS = new Set(['resolve', 'absolute', 'expanduser', 'joinpath', 'with_name']);
const PY_IDENTITY = new Set([
  'os.path.normpath',
  'os.path.expanduser',
  'expanduser',
  'normpath',
  'str',
  'os.fspath',
  'fspath',
]);
// These make a relative path absolute against the directory the process runs in.
const PY_ABSOLUTE = new Set(['os.path.abspath', 'os.path.realpath', 'abspath', 'realpath']);
const PY_CWD = new Set(['os.getcwd', 'getcwd', 'Path.cwd', 'pathlib.Path.cwd']);
const PY_HOME = new Set(['Path.home', 'pathlib.Path.home']);
const HOME_VARIABLES = new Set(['HOME', 'USERPROFILE']);
const PY_SCOPES = new Set(['function_definition', 'lambda']);
const PY_NESTED = new Set(['function_definition', 'class_definition', 'lambda']);

const TEXT_SCANNED = new Set(['.html', '.htm', '.yml', '.yaml', '.md', '.json', '.sh', '.bash']);
const SHELL = new Set(['.sh', '.bash']);
const SHELL_WRITERS = new Set(['tee']);
const SHELL_MOVERS = new Set(['mv', 'cp']);
const SHELL_READERS = new Set(['cat', 'source', '.']);
const RAW_URL = /raw\.githubusercontent\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/([^/\s'"`<>]+)\/([^\s'"`<>?#)]*)/g;
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?|^test_[^/]*\.py|_test\.py)$/;
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'fixtures', '__fixtures__', 'testdata']);

// A value is bounded in both directions: at most this many alternatives, and
// at most this many steps from the call site to the literal that names it.
const MAX_VALUES = 16;
const MAX_DEPTH = 12;

/**
 * The places a landing can name: every tracked file, and every directory that
 * is a prefix of one. Dependency and build directories are left out even when
 * tracked, since nothing the repository authors lands there.
 *
 * @param {Iterable<string>} paths tracked paths
 */
export function trackedPlaces(paths) {
  const files = new Set();
  const dirs = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    if (parts.some((part) => part === 'node_modules' || part === 'dist')) continue;
    files.add(path);
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  return { files, dirs };
}

/**
 * Test files and fixture material write into temporary copies and read
 * fixtures of their own, so what they name is not a place the repository's
 * own code writes or reads. Their facts stay on the file; they land nowhere.
 */
export function isTestMaterial(path) {
  const parts = path.split('/');
  if (parts.slice(0, -1).some((part) => TEST_DIRS.has(part))) return true;
  return TEST_FILE.test(parts[parts.length - 1]);
}

// A test file by the repository's own naming, the convention test runners
// discover by: a .test or .spec marker, test_*.py or *_test.py, or a place
// under a directory named for tests. Fixture directories are not in it; what
// lives there is material a test reads, not a test.
const TEST_NAMED = /(\.(test|spec)\.[^/]+|^test_[^/]*\.py|_test\.py)$/;
const TEST_NAMED_DIRS = new Set(['test', 'tests', '__tests__']);

export function isTestFile(path) {
  const parts = path.split('/');
  if (parts.slice(0, -1).some((part) => TEST_NAMED_DIRS.has(part))) return true;
  return TEST_NAMED.test(parts[parts.length - 1]);
}

// Where a test lives apart from the file it tests: Python keeps tests/ beside
// the package, and a JavaScript package may keep test/ or spec/ beside src/.
const TEST_HOMES = new Set(['test', 'tests', '__tests__', 'spec']);
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);

function testedName(path) {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1);
  const base = path.slice(slash + 1);
  const dot = base.indexOf('.');
  const stem = dot === -1 ? base : base.slice(0, base.lastIndexOf('.'));
  const extension = dot === -1 ? '' : base.slice(base.lastIndexOf('.')).toLowerCase();
  const marked = /^(.+)(?:\.test|\.spec|_test)$/.exec(stem) ?? /^test_(.+)$/.exec(stem);
  return { dir, stem, extension, tested: marked ? marked[1] : null };
}

function sameFamily(a, b) {
  return a === b || (SCRIPT_EXTENSIONS.has(a) && SCRIPT_EXTENSIONS.has(b));
}

/**
 * Whether test is file's own test: a name with a test marker (page.test.js,
 * foo_test.py, test_trainer.py) whose bare name is the file's, in the same
 * language, beside the file or anywhere under a directory named test, tests,
 * __tests__ or spec. tests/test_trainer.py is backpropagate/trainer.py's.
 *
 * @param {string} test
 * @param {string} file
 */
export function isOwnTest(test, file) {
  const t = testedName(test);
  const f = testedName(file);
  if (t.tested == null || f.tested != null || t.tested !== f.stem || !sameFamily(t.extension, f.extension)) return false;
  if (t.dir === f.dir) return true;
  return t.dir.split('/').some((part) => TEST_HOMES.has(part));
}

/** The bare name a test file is named for (trainer for test_trainer.py), or null. */
export function testedStem(path) {
  return testedName(path).tested;
}

/** Either of two files is the other's own test. */
export function ownTestPair(a, b) {
  return isOwnTest(a, b) || isOwnTest(b, a);
}

export function noLandings() {
  return { writes: [], dynamicWrites: 0, reads: [], dynamicReads: 0 };
}

/**
 * Landing facts for a file the engine does not parse. Workflows are read as
 * doors instead, and a file of a kind that is not text a person reads is
 * skipped rather than decoded.
 */
export function textLandings(path, bytes, places) {
  if (isWorkflow(path) || !TEXT_SCANNED.has(extname(path).toLowerCase())) return noLandings();
  const source = bytes.toString('utf8');
  const reads = [];
  for (const pattern of [/"([^"\r\n]*)"/g, /'([^'\r\n]*)'/g]) {
    for (const match of source.matchAll(pattern)) {
      const target = literalPlace(match[1], places);
      if (target != null) reads.push({ target, call: 'literal', confidence: 'text' });
    }
  }
  for (const entry of rawUrls(source, places)) reads.push({ ...entry, confidence: 'text' });
  const shell = SHELL.has(extname(path).toLowerCase()) ? shellLandings(source, places) : { writes: [], reads: [] };
  reads.push(...shell.reads);
  return { writes: sortEntries(shell.writes), dynamicWrites: 0, reads: sortEntries(reads), dynamicReads: 0 };
}

/**
 * What a shell script writes and reads, found by reading its commands as the
 * shell splits them. A redirection out (> or >>), tee, and the last argument
 * of mv or cp write; a redirection in (<), cat and source read, and so does
 * any other argument that names a tracked file, as a quoted path does in any
 * text file. Paths are taken from the repository root, where scripts that
 * name repository files run. A word holding a variable or a glob names no
 * fixed place and is skipped; a here-document's body is another program's
 * text and is not read as commands. Everything found is text confidence.
 */
function shellLandings(source, places) {
  const writes = [];
  const reads = [];
  const write = (word, call) => {
    if (!word?.fixed) return;
    const target = landingOf(closed(word.text), places);
    if (target != null) writes.push({ target, call, confidence: 'text' });
  };
  const read = (word, call) => {
    if (!word?.fixed) return;
    const target = literalPlace(word.text, places);
    if (target != null) reads.push({ target, call, confidence: 'text' });
  };
  let heredoc = null;
  for (const line of source.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    if (heredoc != null) {
      if (line.trim() === heredoc) heredoc = null;
      continue;
    }
    for (const command of shellCommands(shellTokens(line))) {
      const words = [];
      for (let i = 0; i < command.length; i += 1) {
        const token = command[i];
        if (token.type === 'word') {
          words.push(token);
          continue;
        }
        const target = command[i + 1]?.type === 'word' ? command[i + 1] : null;
        i += 1;
        if (token.text === '<<' || token.text === '<<-') {
          if (target) heredoc = target.text;
          continue;
        }
        if (token.text.endsWith('&') || token.text === '<<<') continue;
        if (token.text.startsWith('>') || token.text.startsWith('&>')) write(target, token.text.replace(/^&/, ''));
        else if (token.text === '<') read(target, '<');
      }
      let start = 0;
      while (start < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[start].text)) start += 1;
      const name = words[start]?.text;
      const args = words.slice(start + 1).filter((word) => !word.text.startsWith('-'));
      if (SHELL_WRITERS.has(name)) {
        for (const arg of args) write(arg, name);
        continue;
      }
      let rest = args;
      if (SHELL_MOVERS.has(name) && args.length >= 2) {
        write(args[args.length - 1], name);
        rest = args.slice(0, -1);
      }
      for (const arg of rest) read(arg, SHELL_READERS.has(name) ? name : 'literal');
    }
  }
  return { writes, reads };
}

// One line as the shell tokenizes it: words (unquoted, with fixed false when
// a variable, a command substitution or a glob is in them), redirection
// operators with any file descriptor before them, and the operators that end
// a command. A # at the start of a word begins a comment.
function shellTokens(line) {
  const tokens = [];
  let word = null;
  let quote = null;
  const begin = () => {
    word ??= { type: 'word', text: '', fixed: true };
  };
  const flush = () => {
    if (word) tokens.push(word);
    word = null;
  };
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) quote = null;
      else if (quote === '"' && char === '\\' && i + 1 < line.length) word.text += line[++i];
      else {
        if (quote === '"' && (char === '$' || char === '`')) word.fixed = false;
        word.text += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      begin();
      quote = char;
      continue;
    }
    if (char === '#' && word == null) break;
    if (char === '\\' && i + 1 < line.length) {
      begin();
      word.text += line[++i];
      continue;
    }
    if (char === ' ' || char === '\t') {
      flush();
      continue;
    }
    if (char === '&' && line[i + 1] === '>') {
      flush();
      const op = line[i + 2] === '>' ? '&>>' : '&>';
      tokens.push({ type: 'redirect', text: op });
      i += op.length - 1;
      continue;
    }
    if (char === ';' || char === '|' || char === '&' || char === '(' || char === ')') {
      flush();
      if ((char === '|' || char === '&') && line[i + 1] === char) i += 1;
      tokens.push({ type: 'end' });
      continue;
    }
    if (char === '>' || char === '<') {
      if (word && word.fixed && /^\d+$/.test(word.text)) word = null;
      else flush();
      let op = char;
      while (line[i + 1] === char && op.length < 3) op += line[++i];
      if (op === '<<' && line[i + 1] === '-') op += line[++i];
      if (line[i + 1] === '&') op += line[++i];
      else if (char === '>' && line[i + 1] === '|') i += 1;
      tokens.push({ type: 'redirect', text: op });
      continue;
    }
    begin();
    if ('$`*?[{~'.includes(char)) word.fixed = false;
    word.text += char;
  }
  flush();
  return tokens;
}

function shellCommands(tokens) {
  const commands = [[]];
  for (const token of tokens) {
    if (token.type === 'end') commands.push([]);
    else commands[commands.length - 1].push(token);
  }
  return commands.filter((command) => command.length > 0);
}

/**
 * Landing facts for a parsed file: the tracked places its write calls and
 * read calls name, and how many of those calls name nothing the engine can
 * reduce to a literal. A string that names a tracked place outside any such
 * call is recorded as a read with call 'literal', since naming a place is how
 * code hands it to a function the engine does not know.
 *
 * @param {'javascript'|'typescript'|'tsx'|'python'} language
 * @param {object} root tree-sitter root node
 * @param {string} path the file's tracked path
 * @param {{ files: Set<string>, dirs: Set<string> }} places
 */
export function astLandings(language, root, path, places) {
  const dir = posix.dirname(path);
  const ctx = {
    python: language === 'python',
    file: path,
    dir: dir === '.' ? '' : dir,
    seen: new Set(),
    visiting: new Set(),
    assignments: new Map(),
  };
  const found = { writes: [], dynamicWrites: 0, outsideWrites: 0, reads: [], dynamicReads: 0, outsideReads: 0 };
  const evaluate = ctx.python ? evalPy : evalJs;
  const site = (kind, call, node, countDynamic = true) => {
    if (!node) return;
    const values = evaluate(node, ctx, 0);
    if (values.length === 0) {
      if (countDynamic) found[kind === 'write' ? 'dynamicWrites' : 'dynamicReads'] += 1;
      return;
    }
    const list = kind === 'write' ? found.writes : found.reads;
    if (values.some(outside)) found[kind === 'write' ? 'outsideWrites' : 'outsideReads'] += 1;
    for (const value of values) {
      if (outside(value)) continue;
      if (value.text.includes('://')) {
        if (kind !== 'read' || value.open) continue;
        for (const entry of rawUrls(value.text, places)) list.push({ ...entry, call, confidence: 'ast' });
        continue;
      }
      const target = landingOf(value, places, { directory: DIRECTORY_CALLS.has(call) });
      if (target != null) list.push(landingEntry(target, call, value, places));
    }
  };

  const calls = [];
  walk(root, (node) => {
    if (node.type === 'call_expression' || node.type === 'call') calls.push(node);
    // A module specifier is resolved by the import graph, relative to the
    // importing file; read as a repository path it would name the wrong file.
    const specifier = ctx.python ? null : moduleSpecifier(node);
    if (specifier) ctx.seen.add(key(specifier));
  });
  for (const node of calls) {
    if (ctx.python) pythonSite(node, site);
    else scriptSite(node, site);
  }

  walk(root, (node) => {
    if (isStringNode(node, ctx.python)) {
      for (const text of stringTexts(node, ctx.python)) {
        for (const entry of rawUrls(text, places)) found.reads.push({ ...entry, confidence: 'ast' });
      }
    }
    if (ctx.seen.has(key(node))) return;
    if (!isStringNode(node, ctx.python) && !isPathConstructor(node, ctx.python)) return;
    for (const value of evaluate(node, ctx, 0)) {
      if (value.open || outside(value) || namesItself(value, ctx)) continue;
      const target = literalPlace(value.text, places);
      if (target != null) found.reads.push(landingEntry(target, 'literal', value, places));
    }
  });

  return {
    writes: sortEntries(found.writes),
    dynamicWrites: found.dynamicWrites,
    reads: sortEntries(found.reads),
    dynamicReads: found.dynamicReads,
    ...(found.outsideWrites > 0 ? { outsideWrites: found.outsideWrites } : {}),
    ...(found.outsideReads > 0 ? { outsideReads: found.outsideReads } : {}),
  };
}

// A bare relative path, with nothing fixing where it starts, is relative to
// whoever runs the code; attachLandings decides whose directory that is.
function landingEntry(target, call, value, places) {
  const entry = { target, call, confidence: confidenceOf(value, target, places) };
  if (value.anchor == null && !value.rooted) entry.relative = true;
  return entry;
}

/**
 * The repository paths a Python expression can name, read the way a landing's
 * path argument is read: literals, joins, __file__, .parent and same-file
 * bindings. Only whole paths count; a value with a part the engine cannot
 * read names no file.
 *
 * @param {object} node tree-sitter node
 * @param {string} path the tracked path of the file the node is in
 * @returns {string[]}
 */
export function pythonPathValues(node, path) {
  const dir = posix.dirname(path);
  const ctx = { python: true, file: path, dir: dir === '.' ? '' : dir, seen: new Set(), visiting: new Set(), assignments: new Map() };
  const out = [];
  for (const value of evalPy(node, ctx, 0)) {
    if (value.open) continue;
    let text = value.text.replaceAll('\\', '/');
    if (text.startsWith('/')) continue;
    text = posix.normalize(text);
    if (text === '..' || text.startsWith('../')) continue;
    out.push(text.replace(/^(\.\/)+/, ''));
  }
  return out;
}

function scriptSite(node, site) {
  const fn = node.childForFieldName('function');
  const name = finalName(fn);
  if (name == null) return;
  const args = argumentNodes(node);
  if (JS_WRITES.has(name)) return site('write', name, args[JS_WRITES.get(name)]);
  if (JS_WRITE_SUFFIX.test(name)) return site('write', name, args[0]);
  if (JS_OPEN.has(name)) {
    const mode = openMode(args[1], false);
    if (mode != null) site(mode, name, args[0]);
    return;
  }
  if (JS_READS.has(name)) return site('read', name, args[0]);
  if (NETWORK.has(name)) site('read', name, args[0], false);
}

function pythonSite(node, site) {
  const fn = node.childForFieldName('function');
  if (!fn) return;
  const args = argumentNodes(node);
  if (fn.type === 'identifier') {
    if (fn.text === 'open') {
      const mode = openMode(keywordArgument(node, 'mode') ?? args[1], true);
      if (mode != null) site(mode, 'open', args[0]);
    } else if (NETWORK.has(fn.text)) site('read', fn.text, args[0], false);
    return;
  }
  if (fn.type !== 'attribute') return;
  const object = fn.childForFieldName('object');
  const attribute = fn.childForFieldName('attribute')?.text;
  const owner = object?.type === 'identifier' ? object.text : null;
  const call = owner ? `${owner}.${attribute}` : attribute;
  if (owner === 'os' && PY_OS_WRITES.has(attribute)) return site('write', call, args[PY_OS_WRITES.get(attribute)]);
  if (owner === 'os' && (attribute === 'listdir' || attribute === 'scandir')) return site('read', call, args[0]);
  if (owner === 'shutil' && PY_SHUTIL_WRITES.has(attribute)) return site('write', call, args[1]);
  if (owner === 'glob' && attribute === 'glob') return site('read', call, args[0]);
  if (PY_RECEIVER_WRITES.has(attribute)) return site('write', attribute, object);
  if (PY_RECEIVER_READS.has(attribute)) return site('read', attribute, object);
  if (NETWORK.has(attribute)) site('read', attribute, args[0], false);
}

// 'write' or 'read' for an open call, or null when the mode is not a literal
// and the engine cannot tell which it is.
function openMode(node, python) {
  if (!node) return 'read';
  if (!isStringNode(node, python)) return null;
  const text = stringTexts(node, python).join('');
  return /[wax]/.test(text) ? 'write' : 'read';
}

/**
 * The repository-relative strings an expression may evaluate to, within one
 * file. Each value is { text, open }: open means the text is only a prefix
 * and something the engine could not read follows it. An empty list means
 * nothing could be read at all.
 */
function evalJs(node, ctx, depth) {
  if (!node || depth > MAX_DEPTH) return [];
  ctx.seen.add(key(node));
  const next = depth + 1;
  switch (node.type) {
    case 'parenthesized_expression':
    case 'await_expression':
    case 'as_expression':
    case 'satisfies_expression':
    case 'non_null_expression':
      return evalJs(node.namedChildren[0], ctx, next);
    case 'string':
      return [literalValue(jsStringText(node))];
    case 'template_string':
      return concat(
        node.namedChildren
          .filter((child) => child.type !== 'template_substitution' || child.namedChildren.length > 0)
          .map((child) => (child.type === 'template_substitution' ? evalJs(child.namedChildren[0], ctx, next) : [closed(fragmentText(child))])),
      );
    case 'binary_expression': {
      const operator = node.childForFieldName('operator')?.text;
      const left = node.childForFieldName('left');
      const right = node.childForFieldName('right');
      if (operator === '+') return concat([evalJs(left, ctx, next), evalJs(right, ctx, next)]);
      if (operator === '||' || operator === '??') return fallback(evalJs(left, ctx, next), evalJs(right, ctx, next));
      return [];
    }
    case 'ternary_expression':
      return union([evalJs(node.childForFieldName('consequence'), ctx, next), evalJs(node.childForFieldName('alternative'), ctx, next)]);
    case 'identifier':
      if (node.text === '__dirname') return [anchored(ctx.dir)];
      if (node.text === '__filename') return [anchored(ctx.file)];
      return bindingJs(node.text, node, ctx, next);
    case 'member_expression': {
      const object = node.childForFieldName('object');
      const property = node.childForFieldName('property')?.text;
      // new URL('./x.json', import.meta.url).pathname is the path the URL names.
      if (object?.type === 'new_expression' && (property === 'pathname' || property === 'href')) return evalJs(object, ctx, next);
      if (object?.text === 'process.env' && HOME_VARIABLES.has(property)) return [atCaller('', 'home')];
      if (object?.type !== 'meta_property') return [];
      if (property === 'url' || property === 'filename') return [anchored(ctx.file)];
      if (property === 'dirname') return [anchored(ctx.dir)];
      return [];
    }
    case 'new_expression': {
      if (node.childForFieldName('constructor')?.text !== 'URL') return [];
      const args = argumentNodes(node);
      if (args.length === 1) return evalJs(args[0], ctx, next);
      return urlJoin(evalJs(args[1], ctx, next), evalJs(args[0], ctx, next));
    }
    case 'call_expression': {
      const fn = node.childForFieldName('function');
      const name = finalName(fn);
      const args = argumentNodes(node);
      if (fn?.type === 'member_expression' && fn.childForFieldName('object')?.text === 'process' && name === 'cwd') return [atCaller('', 'cwd')];
      if (name === 'homedir' && (fn?.type === 'identifier' || fn?.childForFieldName('object')?.text === 'os')) return [atCaller('', 'home')];
      if (jsPathCall(fn, name) && name === 'resolve') {
        // resolve() starts from the directory the process runs in unless a
        // segment is absolute, so a relative first segment is the caller's.
        if (args.length === 0) return [atCaller('', 'cwd')];
        return joinValues([fromCaller(evalJs(args[0], ctx, next)), ...args.slice(1).map((arg) => evalJs(arg, ctx, next))], true);
      }
      if (jsPathCall(fn, name) && name === 'join') {
        return joinValues(args.map((arg) => evalJs(arg, ctx, next)), false);
      }
      if (jsPathCall(fn, name) && name === 'dirname') return dirnameValues(evalJs(args[0], ctx, next));
      if (jsPathCall(fn, name) && name === 'normalize') return evalJs(args[0], ctx, next);
      if (fn?.type === 'identifier' && (name === 'fileURLToPath' || name === 'String')) return evalJs(args[0], ctx, next);
      if (fn?.type === 'identifier') return returnsJs(fn.text, node, ctx, next);
      return [];
    }
    default:
      return [];
  }
}

function evalPy(node, ctx, depth) {
  if (!node || depth > MAX_DEPTH) return [];
  ctx.seen.add(key(node));
  const next = depth + 1;
  switch (node.type) {
    case 'parenthesized_expression':
      return evalPy(node.namedChildren[0], ctx, next);
    case 'string':
      if (/f/i.test(node.namedChildren[0]?.text ?? '')) {
        return concat(
          node.namedChildren
            .filter((child) => child.type === 'string_content' || child.type === 'escape_sequence' || child.type === 'interpolation')
            .map((child) => (child.type === 'interpolation' ? evalPy(child.namedChildren[0], ctx, next) : [closed(child.text)])),
        );
      }
      return [literalValue(stringTexts(node, true).join(''))];
    case 'concatenated_string':
      return concat(node.namedChildren.map((child) => evalPy(child, ctx, next)));
    case 'binary_operator': {
      const operator = node.childForFieldName('operator')?.text;
      const left = evalPy(node.childForFieldName('left'), ctx, next);
      const right = evalPy(node.childForFieldName('right'), ctx, next);
      if (operator === '+') return concat([left, right]);
      if (operator === '/') return joinValues([left, right], false);
      return [];
    }
    case 'boolean_operator':
      if (node.childForFieldName('operator')?.text !== 'or') return [];
      return fallback(evalPy(node.childForFieldName('left'), ctx, next), evalPy(node.childForFieldName('right'), ctx, next));
    case 'subscript':
      return pyEnvironment(node.childForFieldName('value'), node.childForFieldName('subscript'));
    case 'conditional_expression':
      return union([evalPy(node.namedChildren[0], ctx, next), evalPy(node.namedChildren[2], ctx, next)]);
    case 'identifier':
      if (node.text === '__file__') return [anchored(ctx.file)];
      return bindingPy(node.text, node, ctx, next);
    case 'attribute':
      if (node.childForFieldName('attribute')?.text === 'parent') return dirnameValues(evalPy(node.childForFieldName('object'), ctx, next));
      return [];
    case 'call': {
      const fn = node.childForFieldName('function');
      const args = argumentNodes(node);
      const name = dottedName(fn);
      if (PY_CWD.has(name)) return [atCaller('', 'cwd')];
      if (PY_HOME.has(name)) return [atCaller('', 'home')];
      if (name === 'os.environ.get' || name === 'os.getenv' || name === 'getenv') return pyEnvironment(null, args[0]);
      if (PY_ABSOLUTE.has(name)) return fromCaller(evalPy(args[0], ctx, next));
      if (PY_JOIN.has(name) || PY_PATH.has(name)) {
        if (args.length === 0) return PY_PATH.has(name) ? [closed('')] : [];
        return joinValues(args.map((arg) => evalPy(arg, ctx, next)), false);
      }
      if (PY_DIRNAME.has(name)) return dirnameValues(evalPy(args[0], ctx, next));
      if (PY_IDENTITY.has(name)) return evalPy(args[0], ctx, next);
      if (fn?.type === 'attribute') {
        const attribute = fn.childForFieldName('attribute')?.text;
        const object = fn.childForFieldName('object');
        if (attribute === 'resolve' || attribute === 'absolute') return fromCaller(evalPy(object, ctx, next));
        if (attribute === 'expanduser') return evalPy(object, ctx, next);
        if (attribute === 'joinpath') return joinValues([object, ...args].map((arg) => evalPy(arg, ctx, next)), false);
        if (attribute === 'with_name' && args.length === 1) {
          return joinValues([dirnameValues(evalPy(object, ctx, next)), evalPy(args[0], ctx, next)], false);
        }
        return [];
      }
      if (fn?.type === 'identifier') return returnsPy(fn.text, node, ctx, next);
      return [];
    }
    default:
      return [];
  }
}

// A name resolves to the nearest enclosing declaration of it. Every value
// assigned to that binding in its scope counts, so a let that is reassigned
// from an argument keeps the literal default it started with.
function bindingJs(name, from, ctx, depth) {
  for (let scope = from.parent; scope; scope = scope.parent) {
    if (JS_FUNCTIONS.has(scope.type) && declaresParameter(scope, name)) return [];
    if (scope.type === 'catch_clause' && scope.childForFieldName('parameter')?.text === name) return [];
    if ((scope.type === 'for_in_statement' || scope.type === 'for_of_statement') && scope.childForFieldName('left')?.text === name) return [];
    const declarator = JS_BLOCKS.has(scope.type) || scope.type === 'for_statement' ? findDeclarator(scope, name) : null;
    if (!declarator) continue;
    const id = `binding:${key(declarator)}`;
    if (ctx.visiting.has(id)) return [];
    ctx.visiting.add(id);
    const lists = [evalJs(declarator.childForFieldName('value'), ctx, depth)];
    for (const right of assignedIn(scope, name, ctx)) lists.push(evalJs(right, ctx, depth));
    ctx.visiting.delete(id);
    return union(lists);
  }
  return [];
}

function assignedIn(scope, name, ctx) {
  const id = `${key(scope)}:${name}`;
  if (!ctx.assignments.has(id)) {
    const rights = [];
    walk(scope, (node) => {
      if (node.type !== 'assignment_expression') return;
      const left = node.childForFieldName('left');
      const right = node.childForFieldName('right');
      if (left?.type === 'identifier' && left.text === name && right) rights.push(right);
    });
    ctx.assignments.set(id, rights);
  }
  return ctx.assignments.get(id);
}

function moduleSpecifier(node) {
  if (node.type === 'import_statement' || node.type === 'export_statement') return node.childForFieldName('source');
  if (node.type !== 'call_expression') return null;
  const fn = node.childForFieldName('function');
  if (fn?.type !== 'import' && !(fn?.type === 'identifier' && fn.text === 'require')) return null;
  return argumentNodes(node)[0] ?? null;
}

function findDeclarator(scope, name) {
  const statements = scope.type === 'for_statement' ? [scope.childForFieldName('initializer')] : scope.namedChildren;
  for (const statement of statements) {
    const declaration = statement?.type === 'export_statement' ? statement.childForFieldName('declaration') : statement;
    if (declaration?.type !== 'lexical_declaration' && declaration?.type !== 'variable_declaration') continue;
    for (const declarator of declaration.namedChildren) {
      if (declarator.type !== 'variable_declarator') continue;
      const id = declarator.childForFieldName('name');
      if (id?.type === 'identifier' && id.text === name) return declarator;
    }
  }
  return null;
}

function declaresParameter(fn, name) {
  const single = fn.childForFieldName('parameter');
  if (single) return single.text === name;
  const params = fn.childForFieldName('parameters');
  if (!params) return false;
  let hit = false;
  const visit = (node) => {
    if (hit || !node) return;
    if (node.type === 'identifier' || node.type === 'shorthand_property_identifier_pattern') {
      if (node.text === name) hit = true;
      return;
    }
    if (node.type === 'assignment_pattern') return visit(node.childForFieldName('left'));
    if (node.type === 'pair_pattern') return visit(node.childForFieldName('value'));
    if (node.type === 'required_parameter' || node.type === 'optional_parameter') return visit(node.childForFieldName('pattern'));
    for (const child of node.namedChildren) visit(child);
  };
  for (const param of params.namedChildren) visit(param);
  return hit;
}

// A call to a function declared in this file evaluates to what it returns,
// with its parameters unknown.
function returnsJs(name, from, ctx, depth) {
  for (let scope = from.parent; scope; scope = scope.parent) {
    if (JS_FUNCTIONS.has(scope.type) && declaresParameter(scope, name)) return [];
    if (!JS_BLOCKS.has(scope.type)) continue;
    const fn = findFunction(scope, name);
    if (!fn) continue;
    const id = `function:${key(fn)}`;
    if (ctx.visiting.has(id)) return [];
    ctx.visiting.add(id);
    const body = fn.childForFieldName('body');
    let values;
    if (body && body.type !== 'statement_block') values = evalJs(body, ctx, depth);
    else values = union(returnExpressions(body, 'return_statement', JS_FUNCTIONS).map((expr) => evalJs(expr, ctx, depth)));
    ctx.visiting.delete(id);
    return values;
  }
  return [];
}

function findFunction(scope, name) {
  for (const statement of scope.namedChildren) {
    const declaration = statement.type === 'export_statement' ? statement.childForFieldName('declaration') : statement;
    if (!declaration) continue;
    if (declaration.type === 'function_declaration' && declaration.childForFieldName('name')?.text === name) return declaration;
    if (declaration.type === 'lexical_declaration' || declaration.type === 'variable_declaration') {
      for (const declarator of declaration.namedChildren) {
        if (declarator.type !== 'variable_declarator' || declarator.childForFieldName('name')?.text !== name) continue;
        const value = declarator.childForFieldName('value');
        if (value && JS_FUNCTIONS.has(value.type)) return value;
      }
    }
  }
  return null;
}

function returnExpressions(body, returnType, nested) {
  const found = [];
  if (!body) return found;
  const stack = [...body.namedChildren];
  while (stack.length > 0) {
    const node = stack.pop();
    if (nested.has(node.type)) continue;
    if (node.type === returnType) {
      if (node.namedChildren[0]) found.push(node.namedChildren[0]);
      continue;
    }
    stack.push(...node.namedChildren);
  }
  return found;
}

// Python binds a name in the function that assigns it, anywhere in that
// function, or else in the module.
function bindingPy(name, from, ctx, depth) {
  for (let scope = from.parent; scope; scope = scope.parent) {
    if (PY_SCOPES.has(scope.type) && declaresPythonParameter(scope, name)) return [];
    if (scope.type !== 'function_definition' && scope.type !== 'module') continue;
    const body = scope.type === 'module' ? scope : scope.childForFieldName('body');
    const rights = [];
    let bound = false;
    const stack = [...(body?.namedChildren ?? [])];
    while (stack.length > 0) {
      const node = stack.pop();
      if (PY_NESTED.has(node.type)) continue;
      if (node.type === 'assignment') {
        const left = node.childForFieldName('left');
        if (left?.type === 'identifier' && left.text === name) {
          bound = true;
          const right = node.childForFieldName('right');
          if (right) rights.push(right);
        }
      } else if ((node.type === 'for_statement' && node.childForFieldName('left')?.text === name) || (node.type === 'as_pattern_target' && node.text === name)) {
        bound = true;
      }
      stack.push(...node.namedChildren);
    }
    if (!bound) continue;
    const id = `binding:${key(scope)}:${name}`;
    if (ctx.visiting.has(id)) return [];
    ctx.visiting.add(id);
    const values = union(rights.map((right) => evalPy(right, ctx, depth)));
    ctx.visiting.delete(id);
    return values;
  }
  return [];
}

function declaresPythonParameter(fn, name) {
  const params = fn.childForFieldName('parameters');
  if (!params) return false;
  return params.namedChildren.some((param) => {
    if (param.type === 'identifier') return param.text === name;
    const inner = param.childForFieldName('name') ?? param.namedChildren.find((child) => child.type === 'identifier');
    return inner?.text === name;
  });
}

function returnsPy(name, from, ctx, depth) {
  for (let scope = from.parent; scope; scope = scope.parent) {
    if (PY_SCOPES.has(scope.type) && declaresPythonParameter(scope, name)) return [];
    if (scope.type !== 'module' && scope.type !== 'block') continue;
    const fn = scope.namedChildren
      .map((child) => (child.type === 'decorated_definition' ? child.childForFieldName('definition') : child))
      .find((child) => child?.type === 'function_definition' && child.childForFieldName('name')?.text === name);
    if (!fn) continue;
    const id = `function:${key(fn)}`;
    if (ctx.visiting.has(id)) return [];
    ctx.visiting.add(id);
    const values = union(returnExpressions(fn.childForFieldName('body'), 'return_statement', PY_NESTED).map((expr) => evalPy(expr, ctx, depth)));
    ctx.visiting.delete(id);
    return values;
  }
  return [];
}

function closed(text) {
  return { text, open: false };
}

// A value built from the file's own location (__dirname, import.meta.url,
// __file__) is anchored to the file: it names the same place whoever runs it
// and from wherever.
function anchored(text) {
  return { text, open: false, anchor: 'file' };
}

// A value relative to where the code is run from ('cwd') or to the home
// directory ('home') is the caller's place, not the repository's: the same
// line writes somewhere else for every person who runs it.
function atCaller(text, anchor) {
  return { text, open: false, anchor };
}

function outside(value) {
  return value.anchor === 'cwd' || value.anchor === 'home';
}

// A literal that starts at ~ is in the home directory.
function literalValue(text) {
  if (text === '~' || text.startsWith('~/')) return atCaller(text.slice(2), 'home');
  return closed(text);
}

// A relative path with nothing fixing where it starts, handed to something
// that resolves it against the working directory.
function fromCaller(values) {
  return values.map((value) => (value.anchor == null && !value.rooted && !value.text.startsWith('/') ? { ...value, anchor: 'cwd' } : value));
}

// dir || '.' is a place the caller passes, or the one they are standing in.
function fallback(left, right) {
  if (left.length > 0) return union([left, right]);
  return right.map((value) => (value.anchor == null && !value.open && (value.text === '.' || value.text === './') ? atCaller('', 'cwd') : value));
}

// os.environ['HOME'] and os.getenv('HOME') are the home directory.
function pyEnvironment(object, name) {
  if (object != null && object.text !== 'os.environ') return [];
  if (name?.type !== 'string') return [];
  return HOME_VARIABLES.has(stringTexts(name, true).join('')) ? [atCaller('', 'home')] : [];
}

// A value that is only the file's own path, or a directory holding it, names
// where the code lives, not a place it reads: HERE = Path(__file__).parent.
function namesItself(value, ctx) {
  if (value.anchor !== 'file') return false;
  return value.text === ctx.file || value.text === '' || ctx.file.startsWith(`${value.text}/`);
}

// A value is rooted when its first segment is a root the engine could not
// read, as in join(someDir, name). A rooted bare file name that equals a
// tracked file at the repository root matched only because the unread root
// might be the repository; the same name under any other directory is a
// different file, so the landing is kept but marked weak. A rooted name that
// equals a tracked directory (join(root, 'records')) is how code names that
// directory, and stays at full confidence.
function confidenceOf(value, target, places) {
  const weak = value.rooted === true && !target.includes('/') && places.files.has(target) && !places.dirs.has(target);
  return weak || namesADirectoryBeside(value, target, places) ? 'weak' : 'ast';
}

// A value that stops partway through a name, packages/starter- with the rest
// built at run time, lands on the directory it stops in. When the names it
// could finish as are directories there (packages/starter-colony), it names
// one of those directories or a new one beside them, not a place inside the
// directory it stops in, so it lands weakly. A prefix of file names there
// (records/run-) is a file written inside the directory, and lands in full.
function namesADirectoryBeside(value, target, places) {
  if (!value.open) return false;
  const text = value.text.replaceAll('\\', '/').replace(/^(\.\/)+/, '');
  if (text.endsWith('/') || !text.startsWith(`${target}/`)) return false;
  const partial = text.slice(target.length + 1);
  if (partial === '' || partial.includes('/')) return false;
  const prefix = `${target}/${partial}`;
  const directChild = (path) => path.startsWith(prefix) && !path.slice(target.length + 1).includes('/');
  let directories = false;
  for (const dir of places.dirs) {
    if (directChild(dir)) {
      directories = true;
      break;
    }
  }
  if (!directories) return false;
  for (const path of places.files) if (directChild(path)) return false;
  return true;
}

// Join path segments. A first segment the engine cannot read is taken as the
// root the rest is relative to (join(repoRoot, 'records')); any later segment
// it cannot read ends the value there, open.
function joinValues(segments, absoluteResets) {
  if (segments.length === 0) return [];
  const anchored = segments[0].length === 0;
  if (anchored && segments.slice(1).every((values) => values.length === 0)) return [];
  let acc = anchored ? [{ ...closed(''), rooted: true }] : segments[0];
  for (const values of segments.slice(1)) {
    const next = [];
    for (const value of acc) {
      if (value.open) next.push(value);
      else if (values.length === 0) next.push({ text: value.text === '' ? '' : `${value.text}/`, open: true, rooted: value.rooted, anchor: value.anchor });
      else {
        for (const segment of values) {
          if (absoluteResets && segment.text.startsWith('/')) continue;
          next.push({ text: value.text === '' ? segment.text : `${value.text}/${segment.text}`, open: segment.open, rooted: value.rooted, anchor: value.anchor });
        }
      }
    }
    acc = cap(next);
  }
  return cap(acc.map((value) => normalizeValue(value, anchored)).filter(Boolean));
}

function normalizeValue(value, anchored) {
  if (value.text.includes('://')) return value;
  let text = value.text.replaceAll('\\', '/');
  if (anchored) text = text.replace(/^\/+/, '');
  if (text.startsWith('/')) return null;
  if (text === '') return value.open ? null : { ...closed(''), rooted: value.rooted, anchor: value.anchor };
  text = posix.normalize(text);
  if (text === '.' || text === './') text = '';
  if (text === '..' || text.startsWith('../')) return null;
  if (text.startsWith('./')) text = text.slice(2);
  if (value.open && text === '') return null;
  return { text, open: value.open, rooted: value.rooted, anchor: value.anchor };
}

function dirnameValues(values) {
  return values
    .map((value) => {
      if (value.open) return value;
      if (value.text === '' || value.text.includes('://')) return null;
      const dir = posix.dirname(value.text);
      return { ...closed(dir === '.' ? '' : dir), rooted: value.rooted, anchor: value.anchor };
    })
    .filter(Boolean);
}

function urlJoin(bases, relatives) {
  const out = [];
  for (const base of bases) {
    if (base.open) continue;
    for (const relative of relatives) {
      if (base.text.includes('://')) {
        out.push({ text: base.text.slice(0, base.text.lastIndexOf('/') + 1) + relative.text, open: relative.open });
      } else {
        const dir = posix.dirname(base.text);
        out.push(...joinValues([[{ ...closed(dir === '.' ? '' : dir), anchor: base.anchor }], [relative]], true));
      }
    }
  }
  return cap(out);
}

// Concatenate the parts of a string built from pieces. An unreadable first
// part followed by a piece that starts with '/' is a root, as in a join;
// any other unreadable part ends the value, open.
function concat(parts) {
  let acc = [closed('')];
  let rooted = false;
  for (let i = 0; i < parts.length; i += 1) {
    if (acc.every((value) => value.open)) break;
    const values = parts[i];
    if (values.length === 0) {
      const next = parts[i + 1];
      if (i === 0 && next && next.length > 0 && next.every((value) => value.text.startsWith('/'))) {
        rooted = true;
        continue;
      }
      acc = acc.map((value) => (value.open ? value : { text: value.text, open: true, rooted: value.rooted, anchor: value.anchor }));
      continue;
    }
    const joined = [];
    for (const value of acc) {
      if (value.open) {
        joined.push(value);
        continue;
      }
      for (const part of values) {
        const text = value.text === '' && (rooted || i > 0) && part.text.startsWith('/') && !part.text.startsWith('//') ? part.text.slice(1) : part.text;
        joined.push({ text: value.text + text, open: part.open, rooted: rooted || value.rooted, anchor: i === 0 ? part.anchor : value.anchor });
      }
    }
    acc = cap(joined);
  }
  return acc.filter((value) => !(value.open && value.text === ''));
}

function union(lists) {
  return cap(lists.flat());
}

function cap(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const id = `${value.open ? 1 : 0}${value.rooted ? 1 : 0}${value.anchor ?? ''}:${value.text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(value);
    if (out.length === MAX_VALUES) break;
  }
  return out;
}

/**
 * The place a value lands on. A value that names a tracked file or a tracked
 * directory lands there. A value written out in full that names a file lands
 * on that file even when the file is not tracked, so long as a tracked
 * directory holds it: a receipt a script writes beside itself at run time is
 * that receipt, and the page must not call the whole directory generated. A
 * directory the call makes or lists, a path ending in a slash, and a value
 * whose tail is built at run time name a directory, and land on the deepest
 * tracked directory their spelled-out text lies under. A path through a
 * dependency or build directory is not the repository's own, so it keeps to
 * the directory above as well.
 *
 * @param {{ text: string, open: boolean }} value
 * @param {{ files: Set<string>, dirs: Set<string> }} places
 * @param {{ directory?: boolean }} [options] directory: the call names a directory
 */
function landingOf(value, places, { directory = false } = {}) {
  let text = value.text.replaceAll('\\', '/');
  if (text.startsWith('/')) return null;
  while (text.startsWith('./')) text = text.slice(2);
  if (!value.open) {
    text = posix.normalize(text);
    if (text === '..' || text.startsWith('../')) return null;
    const bare = text.replace(/\/+$/, '');
    if (places.files.has(bare) || places.dirs.has(bare)) return bare;
    const named = !directory && bare === text && !text.split('/').some((part) => part === 'node_modules' || part === 'dist');
    if (named && holdingDirectory(text, places) != null) return text;
  }
  return holdingDirectory(text, places);
}

function holdingDirectory(text, places) {
  for (let end = text.lastIndexOf('/'); end > 0; end = text.lastIndexOf('/', end - 1)) {
    const dir = text.slice(0, end);
    if (places.dirs.has(dir)) return dir;
  }
  return null;
}

// A literal names a tracked file when it equals the file's path, and a
// tracked directory only when it is written as a path, with a slash: a bare
// word like 'docs' is too often a label to be read as the directory.
function literalPlace(raw, places) {
  if (raw.includes('://')) return null;
  let text = raw.replaceAll('\\', '/');
  while (text.startsWith('./')) text = text.slice(2);
  if (places.files.has(text)) return text;
  const bare = text.replace(/\/+$/, '');
  if (bare.includes('/') || bare !== text) {
    if (places.dirs.has(bare)) return bare;
  }
  return null;
}

function rawUrls(text, places) {
  const out = [];
  for (const match of text.matchAll(RAW_URL)) {
    const path = match[4].replace(/[.,;:]+$/, '').replace(/\/+$/, '');
    if (path === '' || !(places.files.has(path) || places.dirs.has(path))) continue;
    out.push({ target: path, call: 'raw-url', ref: match[3], repo: `${match[1]}/${match[2]}` });
  }
  return out;
}

function sortEntries(entries) {
  const unique = new Map();
  for (const entry of entries) {
    unique.set(`${entry.target}\0${entry.call}\0${entry.ref ?? ''}\0${entry.repo ?? ''}\0${entry.confidence}\0${entry.relative ? 1 : 0}`, entry);
  }
  return [...unique.entries()].sort(([a], [b]) => compare(a, b)).map(([, entry]) => entry);
}

function isStringNode(node, python) {
  if (python) return node.type === 'string' && node.parent?.type !== 'concatenated_string';
  return node.type === 'string' || node.type === 'template_string';
}

// A pathlib expression is a path however it is built: a / join, a .parent,
// or a method that keeps a path a path. The walk meets the outermost one first
// and evaluating it marks every node inside as seen, so the Path(__file__) a
// join starts from is never read as a place of its own.
function isPathConstructor(node, python) {
  if (python) {
    if (node.type === 'binary_operator') return node.childForFieldName('operator')?.text === '/';
    if (node.type === 'attribute') return node.childForFieldName('attribute')?.text === 'parent';
    if (node.type !== 'call') return false;
    const fn = node.childForFieldName('function');
    if (fn?.type === 'attribute' && PY_PATH_METHODS.has(fn.childForFieldName('attribute')?.text)) return true;
    const name = dottedName(fn);
    return PY_JOIN.has(name) || PY_PATH.has(name);
  }
  if (node.type !== 'call_expression') return false;
  const fn = node.childForFieldName('function');
  const name = finalName(fn);
  return (name === 'join' || name === 'resolve') && jsPathCall(fn, name);
}

// The literal texts a string node spells, one per stretch between
// substitutions, so a raw URL is only found where it is written out whole.
function stringTexts(node, python) {
  if (python) {
    const parts = [];
    let current = '';
    for (const child of node.namedChildren) {
      if (child.type === 'string_content' || child.type === 'escape_sequence') current += child.text;
      else if (child.type === 'interpolation') {
        parts.push(current);
        current = '';
      }
    }
    parts.push(current);
    return parts;
  }
  if (node.type === 'string') return [jsStringText(node)];
  const parts = [];
  let current = '';
  for (const child of node.namedChildren) {
    if (child.type === 'template_substitution') {
      parts.push(current);
      current = '';
    } else current += fragmentText(child);
  }
  parts.push(current);
  return parts;
}

function jsStringText(node) {
  return node.namedChildren.map(fragmentText).join('');
}

function fragmentText(node) {
  if (node.type !== 'escape_sequence') return node.text;
  const escaped = node.text.slice(1);
  return escaped === '\\' || escaped === "'" || escaped === '"' || escaped === '`' || escaped === '/' ? escaped : node.text;
}

function finalName(fn) {
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'member_expression') return fn.childForFieldName('property')?.text ?? null;
  return null;
}

// join, resolve and dirname are path calls when bare (imported from
// node:path) or called on the path module; Array#join and Promise.resolve
// are neither.
function jsPathCall(fn, name) {
  if (name == null) return false;
  if (fn.type === 'identifier') return true;
  if (fn.type !== 'member_expression') return false;
  return JS_PATH_MODULES.has(fn.childForFieldName('object')?.text ?? '');
}

function dottedName(fn) {
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type !== 'attribute') return null;
  const object = dottedName(fn.childForFieldName('object'));
  const attribute = fn.childForFieldName('attribute')?.text;
  return object && attribute ? `${object}.${attribute}` : null;
}

function argumentNodes(node) {
  const args = node.childForFieldName('arguments');
  if (!args) return [];
  return args.namedChildren.filter((child) => child.type !== 'comment' && child.type !== 'keyword_argument');
}

function keywordArgument(node, name) {
  const args = node.childForFieldName('arguments');
  for (const child of args?.namedChildren ?? []) {
    if (child.type === 'keyword_argument' && child.childForFieldName('name')?.text === name) return child.childForFieldName('value');
  }
  return null;
}

function walk(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    visit(node);
    const children = node.namedChildren;
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
}

function key(node) {
  return `${node.type}:${node.startIndex}:${node.endIndex}`;
}

/**
 * Where each door and each file lands, and who reads those places.
 *
 * A door lands on what it stages and on what every file in its reach writes;
 * the readers of a door's landing are the files whose reads name it or a path
 * under it, and the doors whose commands mention one. The map-wide list is
 * keyed by the exact place each writer and reader names. A boundary is
 * generated when something writes its root, or every one of its files, and
 * none of its own files write; authored when nothing writes inside it; mixed
 * otherwise. A directory holding more than one part keeps its writers and
 * readers in the list, marked with spans, and is no door's landing.
 *
 * @param {{ files: object[], doors: object[], boundaries: object[], places: { files: Set<string>, dirs: Set<string> } }} input
 */
export function attachLandings({ files, doors, boundaries, places }) {
  const mapped = doors.filter((door) => !door.parseError);
  settleRelativePaths(files, mapped);
  const own = files.filter((file) => !isTestMaterial(file.path)).sort((a, b) => compare(a.path, b.path));
  const byPath = new Map(own.map((file) => [file.path, file]));

  const writers = new Map();
  const readers = new Map();
  const add = (map, target, entry) => {
    if (!map.has(target)) map.set(target, new Map());
    map.get(target).set(canonicalEntry(entry), entry);
  };
  for (const file of own) {
    for (const write of file.writes) add(writers, write.target, { by: file.path, confidence: write.confidence });
  }
  for (const door of mapped) {
    door.stagedTargets = stagedTargets(door.stages, places);
    for (const target of door.stagedTargets) add(writers, target, { by: door.file });
    for (const mention of door.mentions) add(readers, mention.path, { by: door.file });
  }
  const spans = partsSpanned(boundaries, [...writers.keys(), ...readers.keys()], places);
  // A text file inside a place something writes is that writer's output: the
  // paths an index or a roadmap names are its data, not places it reads.
  const strong = new Set([...writers]
    .filter(([target, entries]) => !spans.has(target) && [...entries.values()].some((entry) => entry.confidence !== 'weak'))
    .map(([target]) => target));
  const output = (path) => [...strong].some((target) => path === target || path.startsWith(`${target}/`));
  for (const file of own) {
    const generated = file.reads.some((read) => read.confidence === 'text') && output(file.path);
    for (const read of file.reads) {
      if (generated && read.confidence === 'text') continue;
      add(readers, read.target, readerEntry(file.path, read));
    }
  }

  for (const door of mapped) {
    const targets = new Set(door.stagedTargets);
    for (const path of door.reachFiles ?? []) {
      for (const write of byPath.get(path)?.writes ?? []) if (write.confidence !== 'weak') targets.add(write.target);
    }
    door.landings = [...targets].filter((target) => !spans.has(target)).sort(compare);
    const found = new Map();
    for (const target of door.landings) {
      for (const [place, entries] of readers) {
        if (place !== target && !place.startsWith(`${target}/`)) continue;
        for (const entry of entries.values()) {
          found.set(`${target}\0${canonicalEntry(entry)}`, { ...entry, target });
        }
      }
    }
    door.readers = [...found.entries()].sort(([a], [b]) => compare(a, b)).map(([, entry]) => entry);
    delete door.stagedTargets;
  }

  for (const boundary of boundaries) boundary.origin = originOf(boundary, strong, places);

  return [...new Set([...writers.keys(), ...readers.keys()])].sort(compare).map((target) => {
    const landing = { target, writers: sortedValues(writers.get(target)), readers: sortedValues(readers.get(target)) };
    if (spans.has(target)) landing.spans = spans.get(target);
    return landing;
  });
}

/**
 * A bare relative path is relative to the directory the code runs in. A
 * workflow runs from the repository root, so for a file a workflow reaches
 * that directory is this repository. A file reached only through a command
 * or package people install runs wherever they are, so its bare paths are
 * theirs: counted as outside, never a place here. A file no door reaches
 * keeps its paths, as nothing says whose directory they are.
 */
function settleRelativePaths(files, doors) {
  const byWorkflow = new Set();
  const byInstall = new Set();
  for (const door of doors) {
    const into = door.kind === 'command' || door.kind === 'package' ? byInstall : byWorkflow;
    for (const path of door.reachFiles ?? []) into.add(path);
  }
  for (const file of files) {
    const theirs = byInstall.has(file.path) && !byWorkflow.has(file.path);
    for (const [kind, count] of [['writes', 'outsideWrites'], ['reads', 'outsideReads']]) {
      if (!Array.isArray(file[kind])) continue;
      const kept = [];
      for (const entry of file[kind]) {
        const { relative, ...rest } = entry;
        if (theirs && relative) file[count] = (file[count] ?? 0) + 1;
        else kept.push(rest);
      }
      file[kind] = sortEntries(kept);
    }
  }
}

/**
 * The directories among targets that hold files of more than one part, with
 * how many parts each holds. packages/ above every workspace package is where
 * the parts live, not a place one of them writes: a write that reaches it
 * names no part's output, so it is recorded with spans and lands nowhere.
 */
function partsSpanned(boundaries, targets, places) {
  const wanted = new Set(targets.filter((target) => places.dirs.has(target)));
  const partsUnder = new Map();
  for (const boundary of boundaries) {
    for (const file of boundary.files) {
      for (let at = file.path.indexOf('/'); at !== -1; at = file.path.indexOf('/', at + 1)) {
        const dir = file.path.slice(0, at);
        if (!wanted.has(dir)) continue;
        if (!partsUnder.has(dir)) partsUnder.set(dir, new Set());
        partsUnder.get(dir).add(boundary.name);
      }
    }
  }
  const out = new Map();
  for (const [dir, parts] of partsUnder) if (parts.size > 1) out.set(dir, parts.size);
  return out;
}

// A file kept only so git tracks an empty directory is the directory's, not
// content anyone writes.
const PLACEHOLDER = /(^|\/)\.(gitkeep|keep)$/;

// A place written that is not tracked (a receipt made at run time) is inside
// the boundary whose globs would hold it. A boundary is generated when its
// root or every one of its files is written, a placeholder aside, and none of
// its own files write: a directory of written files beside a .gitkeep is
// generated as surely as one whose files are all tracked.
function originOf(boundary, written, places) {
  const paths = boundary.files.map((file) => file.path);
  const root = boundaryRoot(boundary.globs);
  const holds = picomatch(boundary.globs, { dot: true });
  const inside = [...written].filter((target) => {
    if (paths.includes(target)) return true;
    if (!places.files.has(target) && !places.dirs.has(target)) return holds(target);
    if (root !== '' && target !== root && !target.startsWith(`${root}/`)) return false;
    return paths.some((path) => path.startsWith(`${target}/`));
  });
  if (inside.length === 0) return 'authored';
  const content = paths.filter((path) => !PLACEHOLDER.test(path));
  const covered = (root !== '' && written.has(root)) || (paths.length > 0 && content.every((path) => written.has(path)));
  const writesItself = boundary.files.some((file) => !isTestMaterial(file.path) && (file.writes?.length ?? 0) > 0);
  return covered && !writesItself ? 'generated' : 'mixed';
}

// What follows git add, normalised as a path: a glob stops the path where the
// glob starts, and the place is the deepest tracked one it spells out.
function stagedTargets(stages, places) {
  const out = new Set();
  for (const stage of stages) {
    const glob = stage.search(/[*?[{]/);
    const value = glob === -1 ? closed(stage) : { text: stage.slice(0, glob), open: true };
    const target = landingOf(value, places);
    if (target != null) out.add(target);
  }
  return [...out].sort(compare);
}

function readerEntry(by, read) {
  const entry = { by, call: read.call, confidence: read.confidence };
  if (read.ref != null) entry.ref = read.ref;
  if (read.repo != null) entry.repo = read.repo;
  return entry;
}

function canonicalEntry(entry) {
  return Object.keys(entry)
    .sort()
    .map((name) => `${name}=${entry[name]}`)
    .join('\0');
}

function sortedValues(map) {
  if (!map) return [];
  return [...map.entries()].sort(([a], [b]) => compare(a, b)).map(([, entry]) => entry);
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
