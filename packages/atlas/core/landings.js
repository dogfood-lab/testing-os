import { extname, posix } from 'node:path';
import picomatch from 'picomatch';
import { boundaryRoot } from './entry-points.js';
import { isWorkflow } from './doors.js';
import { mainOnly, writeGuards } from './guards.js';
import { loadsManifest } from './languages.js';

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
// Calls that read a file's content, as a writer does before it writes back
// into the same file: a stamp. existsSync and statSync only look.
const CONTENT_READS = new Set(['readFileSync', 'readFile', 'createReadStream', 'open', 'openSync', 'read_text', 'read_bytes']);
// Calls that make a directory. Making one the repository already tracks
// writes nothing into it, so it says only that the file writes somewhere
// there: evidence that stands when nothing else the file writes is placed
// inside it, and is dropped when something is.
const DIRECTORY_MAKERS = new Set(['mkdirSync', 'mkdir', 'os.makedirs', 'os.mkdir']);
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
// A directory made or named for scratch, which is the system's, not this
// repository's: mkdtemp(), tmpdir(), tempfile.gettempdir().
const JS_TEMP = new Set(['tmpdir', 'mkdtempSync', 'mkdtemp', 'mkdtempDisposableSync']);
const PY_TEMP = new Set(['tempfile.mkdtemp', 'mkdtemp', 'tempfile.gettempdir', 'gettempdir', 'tempfile.mktemp']);
const HOME_VARIABLES = new Set(['HOME', 'USERPROFILE']);
// The checkout a workflow runs in: a path under it is this repository, which
// the map cannot place from the variable alone, so it names no caller's place.
const WORKSPACE_VARIABLES = new Set(['GITHUB_WORKSPACE']);
// The names a command-line parse is conventionally bound to. A path read from
// one (args.out, opts.logos) is whatever the person running the command
// passed, so it is theirs, as a path relative to their directory is.
const CLI_BAGS = new Set(['args', 'argv', 'opts', 'options', 'flags', 'cliArgs', 'parsedArgs', 'cli']);
// A value returned by a function imported from another file of the
// repository: whose place it is is settled once imports resolve.
const HELPER = 'helper:';
const PY_SCOPES = new Set(['function_definition', 'lambda']);
const PY_NESTED = new Set(['function_definition', 'class_definition', 'lambda']);

const TEXT_SCANNED = new Set(['.html', '.htm', '.yml', '.yaml', '.md', '.json', '.sh', '.bash', '.xml', '.toml', '.ps1']);
// A file whose name says it configures something, or a TOML or XML file,
// names the files it configures (an app's icons, a package's logos, a
// project's readme): each tracked path it names is one it is read with.
const CONFIG_NAME = /(^|[._-])(conf|config|configuration|manifest|settings)$/i;
const CONFIG_EXTENSIONS = new Set(['.json', '.jsonc', '.json5', '.yml', '.yaml', '.xml', '.toml', '.plist']);
const MARKDOWN = new Set(['.md']);
// A link or an embed in a page points a person at a place; the page reads
// nothing. [text](path), ![alt](url) and an href or src attribute.
const PAGE_LINKS = [/\]\([^)]*\)/g, /\b(?:href|src)\s*=\s*(?:"[^"]*"|'[^']*')/gi];
const ASTRO_CONFIG = /(^|\/)astro\.config\.[cm]?[jt]s$/;
const SHELL = new Set(['.sh', '.bash']);
const SHELL_WRITERS = new Set(['tee']);
const SHELL_MOVERS = new Set(['mv', 'cp']);
const SHELL_READERS = new Set(['cat', 'source', '.']);
// The commands a page's code shows that read the paths they are handed. cp
// reads all but its last argument; a fetch reads the URL it is handed.
const PAGE_READERS = new Set(['cat', 'cp', 'head', 'tail', 'less', 'more', 'diff', 'source', '.', 'curl', 'wget']);
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
  // A package manifest lists what it ships (files, main, exports) and names
  // the commands it runs, which doors read as commands; it reads nothing.
  if (posix.basename(path) === 'package.json') return noLandings();
  let source = bytes.toString('utf8');
  if (MARKDOWN.has(extname(path).toLowerCase())) {
    for (const link of PAGE_LINKS) source = source.replace(link, ' ');
    return { writes: [], dynamicWrites: 0, reads: sortEntries(markdownReads(source, places)), dynamicReads: 0 };
  }
  if (configurationFile(path)) return { writes: [], dynamicWrites: 0, reads: sortEntries(configurationReads(source, path, places)), dynamicReads: 0 };
  if (extname(path).toLowerCase() === '.ps1') {
    const found = powershellLandings(source, path, places);
    return { writes: sortEntries(found.writes), dynamicWrites: 0, reads: sortEntries(found.reads), dynamicReads: 0 };
  }
  if (extname(path).toLowerCase() === '.xml' || extname(path).toLowerCase() === '.toml') return noLandings();
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

function configurationFile(path) {
  const ext = extname(path).toLowerCase();
  const base = posix.basename(path);
  if (!CONFIG_EXTENSIONS.has(ext) || base === 'package.json' || isTestMaterial(path)) return false;
  if (ext === '.xml' || ext === '.toml' || ext === '.plist') return true;
  return CONFIG_NAME.test(base.slice(0, base.length - ext.length));
}

/**
 * The tracked files and directories a configuration names: each value it
 * quotes, each unquoted YAML value, and each XML element's text, read from
 * the configuration's own directory first, as the tool it configures reads
 * it (tauri.conf.json's icons/32x32.png is src-tauri/icons/32x32.png), and
 * then from the repository root. A backslash is a path separator. Marked
 * call configuration, confidence config: a use, not a quotation.
 */
function configurationReads(source, path, places) {
  const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);
  const values = [];
  for (const pattern of [/"([^"\r\n]*)"/g, /'([^'\r\n]*)'/g, />([^<>\r\n]+)</g, /^\s*(?:-\s+|[\w.-]+:\s+)([^\s#'"{[][^#\r\n]*?)\s*$/gm]) {
    for (const match of source.matchAll(pattern)) values.push(match[1].trim());
  }
  const reads = [];
  const seen = new Set();
  for (const value of values) {
    if (value === '' || value.includes('://')) continue;
    const text = value.replaceAll('\\', '/');
    const local = dir ? posix.normalize(`${dir}/${text}`) : text;
    const target = (local.startsWith('../') ? null : literalPlace(local, places)) ?? literalPlace(text, places);
    // A directory holding the configuration is where it lives, not a place
    // it configures.
    if (target == null || target === path || path.startsWith(`${target}/`) || seen.has(target)) continue;
    seen.add(target);
    reads.push({ target, call: 'configuration', confidence: 'config' });
  }
  return reads;
}

const PS_COPIERS = new Set(['copy-item', 'cp', 'copy', 'cpi', 'move-item', 'mv', 'move', 'mi']);
const PS_READERS = new Set(['get-content', 'gc', 'cat', 'type', 'import-csv', 'import-clixml']);
const PS_WRITERS = new Set(['set-content', 'sc', 'add-content', 'ac', 'out-file', 'export-csv']);
const PS_CHILDREN = /^(?:Get-ChildItem|gci|ls|dir)\s+(.+?)\s*\|\s*(?:ForEach-Object|foreach|%)\s*\{\s*$/i;

/**
 * What a PowerShell script reads and writes: Copy-Item and Move-Item read
 * their source and write their destination, Get-Content reads, Set-Content,
 * Add-Content and Out-File write. A path is read through the script's own
 * variables, each assigned once from $PSScriptRoot, a string, Join-Path or
 * Split-Path -Parent, and through $_ in a ForEach-Object block that
 * Get-ChildItem hands a path. A path built any other way names nothing. By
 * text, as a shell script is read.
 */
function powershellLandings(source, path, places) {
  const vars = new Map([['psscriptroot', posix.dirname(path) === '.' ? '' : posix.dirname(path)]]);
  const reads = [];
  const writes = [];
  let piped = null;
  const place = (value) => {
    if (value == null) return null;
    const glob = value.search(/[*?[]/);
    const spelled = glob === -1 ? value : value.slice(0, Math.max(value.lastIndexOf('/', glob), 0));
    return spelled === '' ? null : literalPlace(spelled, places) ?? (places.dirs.has(spelled) ? spelled : null);
  };
  for (const raw of source.replace(/<#[\s\S]*?#>/g, ' ').split(/\r?\n/)) {
    const line = raw.replace(/^\s*#.*$/, '').trim();
    if (line === '') continue;
    const assign = /^\$(\w+)\s*=\s*(.+)$/.exec(line);
    if (assign) {
      vars.set(assign[1].toLowerCase(), psValue(assign[2], vars, piped));
      continue;
    }
    const children = PS_CHILDREN.exec(line);
    if (children) {
      piped = psValue(psWords(children[1])[0] ?? '', vars, null);
      continue;
    }
    if (line.startsWith('}')) {
      piped = null;
      continue;
    }
    const words = psWords(line);
    const command = words[0]?.toLowerCase();
    if (command == null) continue;
    const named = new Map();
    const positional = [];
    for (let i = 1; i < words.length; i += 1) {
      if (/^-[A-Za-z]+$/.test(words[i])) {
        const flag = words[i].toLowerCase();
        if (['-path', '-literalpath', '-destination', '-filepath', '-value'].includes(flag) && i + 1 < words.length) named.set(flag, words[++i]);
      } else positional.push(words[i]);
    }
    const value = (word) => (word == null ? null : psValue(word, vars, piped));
    if (PS_COPIERS.has(command)) {
      const from = place(value(named.get('-path') ?? named.get('-literalpath') ?? positional[0]));
      const to = place(value(named.get('-destination') ?? positional[named.has('-path') || named.has('-literalpath') ? 0 : 1]));
      if (from != null) reads.push({ target: from, call: 'Copy-Item', confidence: 'text' });
      if (to != null) writes.push({ target: to, call: 'Copy-Item', confidence: 'text' });
    } else if (PS_READERS.has(command)) {
      const from = place(value(named.get('-path') ?? named.get('-literalpath') ?? positional[0]));
      if (from != null) reads.push({ target: from, call: 'Get-Content', confidence: 'text' });
    } else if (PS_WRITERS.has(command)) {
      const to = place(value(named.get('-path') ?? named.get('-filepath') ?? named.get('-literalpath') ?? positional[0]));
      if (to != null) writes.push({ target: to, call: words[0], confidence: 'text' });
    }
  }
  return { reads, writes };
}

// One PowerShell line's words: a quoted string, a parenthesized expression
// and a bare word each count as one.
function psWords(text) {
  const words = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '|' || ch === ';' || ch === '{' || ch === '}') break;
    let end = i;
    if (ch === '"' || ch === "'") {
      end = text.indexOf(ch, i + 1);
      end = end === -1 ? text.length : end + 1;
    } else if (ch === '(') {
      let depth = 0;
      for (end = i; end < text.length; end += 1) {
        if (text[end] === '(') depth += 1;
        else if (text[end] === ')') {
          depth -= 1;
          if (depth === 0) {
            end += 1;
            break;
          }
        }
      }
    } else {
      while (end < text.length && !/[\s|;{}()]/.test(text[end])) end += 1;
      // A closing parenthesis with no opening one is punctuation, not a word.
      if (end === i) {
        i += 1;
        continue;
      }
    }
    words.push(text.slice(i, end));
    i = end;
  }
  return words;
}

// The repository path a PowerShell expression names, or null: a string, a
// variable the script assigned, $PSScriptRoot, $_ in a block Get-ChildItem
// feeds, Join-Path and Split-Path -Parent of those.
function psValue(expression, vars, piped) {
  let text = expression.trim();
  while (text.startsWith('(') && text.endsWith(')')) text = text.slice(1, -1).trim();
  const words = psWords(text);
  if (words.length === 0) return null;
  const head = words[0].toLowerCase();
  const norm = (value) => {
    if (value == null) return null;
    const out = posix.normalize(value.replaceAll('\\', '/') || '.').replace(/\/+$/, '');
    return out === '.' ? '' : out.startsWith('../') || out === '..' || out.startsWith('/') || /^[A-Za-z]:/.test(out) ? null : out;
  };
  if (head === 'join-path') {
    const parts = words.slice(1).filter((word) => !word.startsWith('-')).map((word) => psValue(word, vars, piped));
    if (parts.length < 2 || parts.some((part) => part == null)) return null;
    return norm(parts.filter((part) => part !== '').join('/'));
  }
  if (head === 'split-path') {
    const target = words.slice(1).find((word) => !word.startsWith('-'));
    if (!words.slice(1).some((word) => word.toLowerCase() === '-parent') && words.slice(1).some((word) => word.startsWith('-'))) return null;
    const inner = target == null ? null : psValue(target, vars, piped);
    if (inner == null || inner === '') return null;
    return inner.includes('/') ? inner.slice(0, inner.lastIndexOf('/')) : '';
  }
  if (words.length !== 1) return null;
  const word = words[0];
  if (word.startsWith("'")) return norm(word.slice(1, -1));
  if (word.startsWith('"')) {
    let failed = false;
    const spelled = word.slice(1, -1).replace(/\$(\w+)/g, (_, name) => {
      const known = vars.get(name.toLowerCase());
      if (known == null) failed = true;
      return known ?? '';
    });
    return failed ? null : norm(spelled);
  }
  if (/^\$_(?:\.FullName)?$/i.test(word)) return piped;
  if (word.startsWith('$')) return vars.get(word.slice(1).toLowerCase()) ?? null;
  return null;
}

/**
 * What a Markdown page reads. Prose that names a place points a person at it
 * and reads nothing, so only the page's code counts: a code span or a fenced
 * block, read as the shell reads it, and in it only a command that reads what
 * it is handed (cat, cp's sources, a fetch of a raw URL), a path handed to a
 * --flag, or a < redirection. A $ or > prompt before the command is the page's.
 */
function markdownReads(source, places) {
  const reads = [];
  const add = (word, call) => {
    if (!word?.fixed) return;
    for (const entry of rawUrls(word.text, places)) reads.push({ ...entry, confidence: 'text' });
    const target = argumentPlace(word.text, places);
    if (target != null) reads.push({ target, call, confidence: 'text' });
  };
  for (const line of codeLines(source)) {
    for (const command of shellCommands(shellTokens(line))) {
      const words = [];
      for (let i = 0; i < command.length; i += 1) {
        if (command[i].type === 'word') words.push(command[i]);
        else if (command[i].text === '<' && command[i + 1]?.type === 'word') add(command[++i], '<');
        else i += 1;
      }
      let start = 0;
      while (start < words.length && (words[start].text === '$' || words[start].text === '>' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[start].text))) start += 1;
      const name = words[start]?.text;
      const args = words.slice(start + 1);
      for (let i = 0; i < args.length; i += 1) {
        const text = args[i].text;
        if (!text.startsWith('--')) continue;
        const eq = text.indexOf('=');
        if (eq !== -1) add({ text: text.slice(eq + 1), fixed: args[i].fixed }, text.slice(0, eq));
        else if (args[i + 1] && !args[i + 1].text.startsWith('-')) add(args[i + 1], text);
      }
      if (!PAGE_READERS.has(name)) continue;
      const positional = args.filter((word) => !word.text.startsWith('-'));
      for (const word of name === 'cp' ? positional.slice(0, -1) : positional) add(word, name);
    }
  }
  return reads;
}

// Every line of the page's code: each line of a fenced block, of a block
// indented four spaces after a blank line, and the text of each code span
// outside them.
function codeLines(source) {
  const lines = [];
  let fence = null;
  let indented = false;
  let blank = true;
  for (const line of source.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence != null) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      else lines.push(line);
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    const code = /^(?: {4}|\t)/.test(line) && line.trim() !== '';
    indented = code && (indented || blank);
    blank = line.trim() === '';
    if (indented) {
      lines.push(line);
      continue;
    }
    for (const match of line.matchAll(/(`+)([^`]+?)\1(?!`)/g)) lines.push(match[2]);
  }
  return lines;
}

// A path a command is handed names a tracked file, or a tracked directory
// with or without its slash: the command is what makes the word a path.
function argumentPlace(raw, places) {
  if (raw.includes('://')) return null;
  let text = raw.replaceAll('\\', '/');
  while (text.startsWith('./')) text = text.slice(2);
  if (places.files.has(text)) return text;
  const bare = text.replace(/\/+$/, '');
  return bare !== '' && places.dirs.has(bare) ? bare : null;
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
// A workflow step's shell is read from the directory it starts in, and cd,
// pushd and popd move it: a write after cd "$SANDBOX" goes where the
// variable points, not into this repository, and is not read as a place.
function shellLandings(source, places, { dir = '', follow = false } = {}) {
  const writes = [];
  const reads = [];
  let here = dir;
  const stack = [];
  const moved = (target) => {
    if (!target?.fixed || target.text.startsWith('/') || target.text.startsWith('~')) return null;
    const next = posix.normalize(here === '' ? target.text : `${here}/${target.text}`).replace(/\/+$/, '');
    if (next === '..' || next.startsWith('../')) return null;
    return next === '.' ? '' : next;
  };
  const write = (word, call) => {
    if (!word?.fixed || here == null) return;
    // Output under a build directory (cp -r out/. site/dist/) is that
    // directory's, which the repository does not track, never the tracked one above.
    const target = writtenPlace(closed(here === '' || word.text.startsWith('/') ? word.text : `${here}/${word.text}`), places);
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
      if (follow && (name === 'cd' || name === 'pushd')) {
        if (name === 'pushd') stack.push(here);
        here = here == null ? null : moved(args[0]);
        continue;
      }
      if (follow && name === 'popd') {
        here = stack.length > 0 ? stack.pop() : dir;
        continue;
      }
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
    places,
    seen: new Set(),
    visiting: new Set(),
    assignments: new Map(),
  };
  const found = { writes: [], dynamicWrites: 0, outsideWrites: 0, reads: [], dynamicReads: 0, outsideReads: 0, pendingWrites: [], pendingReads: [], pendingParams: [] };
  const evaluate = ctx.python ? evalPy : evalJs;
  const site = (kind, call, node, countDynamic = true) => {
    if (!node) return;
    const all = ctx.python ? evaluate(node, ctx, 0) : throughClosure(node, ctx);
    const unless = kind === 'write' ? writeGuards(node, ctx.python) : [];
    if (all.length === 0) {
      if (countDynamic) found[kind === 'write' ? 'dynamicWrites' : 'dynamicReads'] += 1;
      return;
    }
    // A path rooted at a parameter of a module-level function is settled
    // from the calls that function is given (settleParamPaths).
    // The other alternatives of the same path are read here, and a site is
    // counted once: settled, it adds only what they did not.
    const bound = all.filter(boundParam);
    if (bound.length > 0) {
      const rest = all.filter((value) => !boundParam(value));
      found.pendingParams.push({
        kind,
        call,
        countDynamic: countDynamic && rest.length === 0,
        counted: rest.some(outside),
        values: bound.map((value) => ({ param: { ...value.param }, open: value.open, text: value.text, ...(value.open && value.tail != null ? { tail: value.tail } : {}) })),
        ...(unless.length > 0 ? { unless } : {}),
      });
      if (rest.length === 0) return;
    }
    const helpers = [...new Set(all.filter(isHelper).map((value) => value.anchor.slice(HELPER.length)))].sort();
    const list = kind === 'write' ? found.writes : found.reads;
    // A write under the directory the command runs in whose path from there
    // names a place this repository tracks is the committed output of a run
    // from the repository root: .multi-claude/drill/ written under
    // process.cwd() and checked in. It lands there, marked fromCwd, and is
    // not counted as the caller's.
    const rooted = kind === 'write' ? all.filter((value) => value.anchor === 'cwd' && value.text !== '').map((value) => [value, cwdPlace(value, call, places)]) : [];
    for (const [, target] of rooted) {
      if (target != null) list.push({ target, call, confidence: 'ast', fromCwd: true, ...(unless.length > 0 ? { unless } : {}) });
    }
    const settled = new Set(rooted.filter(([, target]) => target != null).map(([value]) => value));
    // Until the imported function is read, its return is a root the engine
    // cannot read, as join(root, 'records') has.
    const values = all.filter((value) => !boundParam(value) && !settled.has(value)).map((value) => (isHelper(value) ? asRoot(value) : value));
    if (values.length === 0) return;
    const theirs = values.some(outside);
    if (theirs) found[kind === 'write' ? 'outsideWrites' : 'outsideReads'] += 1;
    const before = list.length;
    let unplaced = false;
    for (const value of values) {
      if (outside(value)) continue;
      if (value.text.includes('://')) {
        if (kind !== 'read' || value.open) continue;
        for (const entry of rawUrls(value.text, places)) list.push({ ...entry, call, confidence: 'ast' });
        continue;
      }
      // A path built at run time shaped like no tracked file makes files this
      // repository does not keep, under the place it is built in.
      const target = shapedLikeNothing(value, call, places) ? shapedTarget(value) : kind === 'write' ? writtenPlace(value, places) : landingOf(value, places);
      // A root read at run time is never a placeholder's: canon/ holding only
      // a .gitkeep marks where a user's files go, not where this code writes.
      if (target != null && value.rooted && placeholder(target, places)) unplaced = true;
      else if (target != null) list.push({ ...landingEntry(target, call, value, places), ...(unless.length > 0 ? { unless } : {}) });
      else if (value.open) unplaced = true;
    }
    // A root another file's function returns is settled once that file is
    // known: the caller's place when every such function returns one, and
    // otherwise the unreadable root it was read as, landings and all. A path
    // that is nothing but the function's return names no place until then.
    if (helpers.length > 0 && !theirs) {
      const entries = list.splice(before);
      const whole = all.every((value) => isHelper(value) && value.text === '' && !value.open);
      const dynamic = countDynamic && (whole || (unplaced && entries.length === 0)) ? 1 : 0;
      found[kind === 'write' ? 'pendingWrites' : 'pendingReads'].push({ helpers, entries, dynamic });
      return;
    }
    // A name built at run time beside nothing tracked (README.${lang}.md at
    // the root) is a path the map cannot name, as a whole-path variable is.
    if (unplaced && list.length === before && countDynamic) found[kind === 'write' ? 'dynamicWrites' : 'dynamicReads'] += 1;
  };

  const calls = [];
  walk(root, (node) => {
    if (node.type === 'call_expression' || node.type === 'call') calls.push(node);
    // A module specifier is resolved by the import graph, relative to the
    // importing file; read as a repository path it would name the wrong file.
    const specifier = ctx.python ? null : moduleSpecifier(node);
    if (specifier) ctx.seen.add(key(specifier));
  });
  const pil = ctx.python && importsPillow(root);
  for (const node of calls) {
    if (ctx.python) pythonSite(node, site, pil);
    else scriptSite(node, site);
  }
  if (!ctx.python && ASTRO_CONFIG.test(path)) found.reads.push(...starlightReads(root, ctx, places));

  walk(root, (node) => {
    if (isStringNode(node, ctx.python)) {
      for (const text of stringTexts(node, ctx.python)) {
        for (const entry of rawUrls(text, places)) found.reads.push({ ...entry, confidence: 'ast' });
      }
    }
    if (ctx.seen.has(key(node))) return;
    if (!isStringNode(node, ctx.python) && !isPathConstructor(node, ctx.python)) return;
    for (const raw of evaluate(node, ctx, 0)) {
      const value = isHelper(raw) ? asRoot(raw) : raw;
      if (value.open || outside(value) || namesItself(value, ctx)) continue;
      const target = literalPlace(value.text, places);
      if (target != null) found.reads.push(landingEntry(target, 'literal', value, places));
    }
  });

  const rooted = callerRootedFunctions(root, ctx);
  const paramCalls = recordedCalls(root, calls, ctx);
  const defaultCalls = leftOutCalls(root, calls, ctx);
  return {
    writes: sortEntries(withoutRedundantDirectories(found.writes, places)),
    dynamicWrites: found.dynamicWrites,
    reads: sortEntries(found.reads),
    dynamicReads: found.dynamicReads,
    ...(found.outsideWrites > 0 ? { outsideWrites: found.outsideWrites } : {}),
    ...(found.outsideReads > 0 ? { outsideReads: found.outsideReads } : {}),
    ...(found.pendingWrites.length > 0 ? { pendingWrites: found.pendingWrites } : {}),
    ...(found.pendingReads.length > 0 ? { pendingReads: found.pendingReads } : {}),
    ...(Object.keys(rooted).length > 0 ? { callerRooted: rooted } : {}),
    ...(found.pendingParams.length > 0 ? { pendingParams: found.pendingParams } : {}),
    ...(paramCalls.length > 0 ? { paramCalls } : {}),
    ...(defaultCalls.length > 0 ? { defaultCalls } : {}),
  };
}

// A parameter of a named module-level function, which the calls to it bind.
function boundParam(value) {
  return value.anchor === 'param' && value.param != null;
}

/**
 * The calls a file makes to a module-level function of its own or to one it
 * imports from a file of this repository, with what each argument reads as,
 * for settleParamPaths. The arguments are read in a scratch context, so a
 * literal handed over is still found as the literal read it is. A call no
 * argument of which reads as anything is left out.
 */
function recordedCalls(root, calls, ctx) {
  if (ctx.python) return [];
  const local = new Set(moduleFunctions(root, false).map(([name]) => name));
  const imports = scriptImports(root);
  const scratch = { ...ctx, seen: new Set(), visiting: new Set() };
  const out = [];
  for (const node of calls) {
    const fn = node.childForFieldName('function');
    if (fn?.type !== 'identifier') continue;
    const target = local.has(fn.text) ? { local: fn.text } : imports.has(fn.text) ? { specifier: imports.get(fn.text).specifier, name: imports.get(fn.text).name } : null;
    if (target == null) continue;
    const nodes = argumentNodes(node);
    const args = nodes.map((_, index) => {
      const passed = passedAt(nodes, index, scratch, 0);
      const fields = passed.fields ? Object.fromEntries(Object.entries(passed.fields).map(([name, values]) => [name, values.map(compactValue)])) : null;
      return { values: passed.values.map(compactValue), ...(fields ? { fields } : {}) };
    });
    if (args.some((arg) => arg.values.length > 0 || Object.values(arg.fields ?? {}).some((values) => values.length > 0))) out.push({ ...target, args, ...(mainOnly(node, false) ? { main: true } : {}) });
  }
  return out;
}

/**
 * The calls a file makes to a module-level function of its own or to one it
 * imports, with the positions each leaves out (past its last argument, or
 * passed undefined) and whether it runs only when the file is the program,
 * for the defaults settleParamPaths settles.
 */
function leftOutCalls(root, calls, ctx) {
  if (ctx.python) return [];
  const local = new Set(moduleFunctions(root, false).map(([name]) => name));
  const imports = scriptImports(root);
  const out = [];
  for (const node of calls) {
    const fn = node.childForFieldName('function');
    if (fn?.type !== 'identifier') continue;
    const target = local.has(fn.text) ? { local: fn.text } : imports.has(fn.text) ? { specifier: imports.get(fn.text).specifier, name: imports.get(fn.text).name } : null;
    if (target == null) continue;
    const nodes = argumentNodes(node);
    const unset = nodes.flatMap((arg, index) => (arg.type === 'undefined' || (arg.type === 'identifier' && arg.text === 'undefined') ? [index] : []));
    out.push({ ...target, count: nodes.length, ...(unset.length > 0 ? { unset } : {}), ...(mainOnly(node, false) ? { main: true } : {}) });
  }
  return out;
}

function compactValue(value) {
  return {
    text: value.text,
    open: value.open,
    ...(value.rooted ? { rooted: true } : {}),
    ...(value.anchor != null ? { anchor: value.anchor } : {}),
    ...(value.param ? { param: { ...value.param } } : {}),
    ...(value.open && value.tail != null ? { tail: value.tail } : {}),
    ...(value.defaultOf ? { defaultOf: { ...value.defaultOf } } : {}),
  };
}

// A parameter's root is followed back through at most this many calls.
const PARAM_HOPS = 3;

/**
 * The writes and reads rooted at a parameter of a module-level function,
 * settled from the calls this repository makes to that function: each
 * argument a call passes is the root. One that is a place of this repository
 * (a literal, a path built from a file's own location) lands there; one that
 * is the caller's place (the working directory, the home directory, a
 * command-line argument) is counted outside, and so is a function nothing but
 * tests call, since it is called from outside the repository. An argument
 * that is another function's parameter is followed to that function's calls,
 * a few calls deep. An argument the engine cannot read leaves the root
 * unread, as it was before calls were read: the place the rest of the path
 * names is kept. A placeholder directory is never landed on from a root read
 * at run time. The recorded calls are dropped once used.
 *
 * @param {Iterable<object>} files every file of the map
 * @param {{ files: Set<string>, dirs: Set<string> }} places
 */
export function settleParamPaths(files, places) {
  const byPath = new Map();
  for (const file of files) byPath.set(file.path, file);
  const callers = new Map();
  for (const file of byPath.values()) {
    if (!file.paramCalls) continue;
    for (const call of file.paramCalls) {
      const target = calleeKey(file, call);
      if (target == null) continue;
      if (!callers.has(target)) callers.set(target, []);
      callers.get(target).push({ path: file.path, args: call.args, ...(call.main ? { main: true } : {}) });
    }
  }
  const leaving = new Map();
  for (const file of byPath.values()) {
    for (const call of file.defaultCalls ?? []) {
      const target = calleeKey(file, call);
      if (target == null) continue;
      if (!leaving.has(target)) leaving.set(target, []);
      leaving.get(target).push({ path: file.path, ...call });
    }
  }
  // A test's calls hand the functions it calls temporary copies, so they
  // settle nothing, except the test's calls to its own functions: the test
  // decides where those write. A place a call hands down from behind the
  // writer's own main guard is written only when that file is the program,
  // and is marked so (guards.js).
  const roots = (path, fn, param, rest, depth, writer, guarded = false) => {
    const out = { places: [], outside: false, unread: false, unreadFree: false };
    const calls = (callers.get(`${path}#${fn}`) ?? []).filter((call) => !isTestMaterial(call.path) || call.path === path);
    if (calls.length === 0) {
      out.outside = true;
      return out;
    }
    for (const call of calls) {
      const values = passedFor(call.args[param.index], param);
      const main = guarded || (call.main === true && call.path === writer);
      const unread = () => {
        out.unread = true;
        if (!main) out.unreadFree = true;
      };
      if (values.length === 0) unread();
      for (const value of values) {
        if (boundParam(value)) {
          if (depth + 1 >= PARAM_HOPS) {
            unread();
            continue;
          }
          const joined = appendRest(value, rest);
          const deeper = roots(call.path, value.param.fn, value.param, { text: joined.text, open: joined.open, ...(joined.tail != null ? { tail: joined.tail } : {}) }, depth + 1, writer, main);
          out.places.push(...deeper.places);
          out.outside ||= deeper.outside;
          out.unread ||= deeper.unread;
          out.unreadFree ||= deeper.unreadFree;
        } else if (isHelper(value)) {
          // A root another file's function returns from the home directory
          // or the environment is the caller's through every call it is
          // handed down; any other such root stays unread.
          if (helperRooted(byPath, call.path, value)) out.outside = true;
          else unread();
        } else if (outside(value)) out.outside = true;
        else out.places.push({ ...appendRest(value, rest), ...(main ? { main: true } : {}) });
      }
    }
    return out;
  };
  for (const file of byPath.values()) {
    for (const pending of file.pendingParams ?? []) {
      const [kind, outsideCount, dynamicCount] = pending.kind === 'write' ? ['writes', 'outsideWrites', 'dynamicWrites'] : ['reads', 'outsideReads', 'dynamicReads'];
      const entries = [];
      let theirs = false;
      for (const bound of pending.values) {
        const rest = { text: bound.text, open: bound.open, ...(bound.tail != null ? { tail: bound.tail } : {}) };
        const found = roots(file.path, bound.param.fn, bound.param, rest, 0, file.path);
        theirs ||= found.outside;
        const before = entries.length;
        const land = (value) => {
          const target = shapedLikeNothing(value, pending.call, places) ? shapedTarget(value) : pending.kind === 'write' ? writtenPlace(value, places) : landingOf(value, places);
          if (target == null || (value.rooted && placeholder(target, places))) return;
          const unless = [...new Set([...(pending.unless ?? []), ...(value.main && pending.kind === 'write' ? ['main'] : [])])].sort();
          entries.push({ ...landingEntry(target, pending.call, value, places), ...(unless.length > 0 ? { unless } : {}) });
        };
        for (const value of found.places) land(value);
        // An argument read as nothing is still what the caller passes: the
        // place the rest of the path names is kept when it names one, and
        // otherwise the write is theirs.
        if (found.unread) {
          const kept = entries.length;
          land({ ...rest, rooted: true, ...(found.unreadFree ? {} : { main: true }) });
          if (entries.length === kept && entries.length === before) theirs = true;
        }
      }
      if (theirs && !pending.counted) file[outsideCount] = (file[outsideCount] ?? 0) + 1;
      // A directory made where the file also writes inside it is only
      // evidence of that write, as astLandings has it.
      if (entries.length > 0) file[kind] = sortEntries(kind === 'writes' ? withoutRedundantDirectories([...(file[kind] ?? []), ...entries], places) : [...(file[kind] ?? []), ...entries]);
      else if (!theirs && pending.countDynamic) file[dynamicCount] = (file[dynamicCount] ?? 0) + 1;
    }
    delete file.pendingParams;
    delete file.paramCalls;
  }
  for (const file of byPath.values()) {
    for (const kind of ['writes', 'reads']) {
      if (!Array.isArray(file[kind]) || !file[kind].some((entry) => entry.defaultOf)) continue;
      file[kind] = sortEntries(file[kind].map((entry) => {
        if (!entry.defaultOf) return entry;
        const { defaultOf, ...rest } = entry;
        return kind === 'writes' && defaultRunsAsProgram(defaultOf, file.path, leaving) ? { ...rest, unless: [...new Set([...(rest.unless ?? []), 'main'])].sort() } : rest;
      }));
    }
  }
  for (const file of byPath.values()) {
    delete file.defaultCalls;
    delete file.callerRooted;
  }
}

// Whether a value is the return of a function another file exports whose
// every return is the caller's place (callerRootedFunctions).
function helperRooted(byPath, path, value) {
  const helper = value.anchor.slice(HELPER.length);
  const at = helper.lastIndexOf('#');
  const specifier = helper.slice(0, at);
  const imports = byPath.get(path)?.imports;
  const site = Array.isArray(imports) ? imports.find((item) => item.specifier === specifier && item.resolved?.outcome === 'file') : null;
  return site != null && byPath.get(site.resolved.path)?.callerRooted?.[helper.slice(at + 1)] != null;
}

// The function a recorded call names, as path#name.
function calleeKey(file, call) {
  if (call.local != null) return `${file.path}#${call.local}`;
  const site = Array.isArray(file.imports) ? file.imports.find((item) => item.specifier === call.specifier && item.resolved?.outcome === 'file') : null;
  return site ? `${site.resolved.path}#${call.name}` : null;
}

/**
 * Whether a parameter's default is taken only when the writer's file runs as
 * a program: every call this repository makes that leaves the parameter out,
 * tests aside, is behind the writer's own main guard. With no such call the
 * default is taken by callers outside the repository, and is left as it was.
 */
function defaultRunsAsProgram(of, writer, leaving) {
  const calls = (leaving.get(`${of.path}#${of.fn}`) ?? [])
    .filter((call) => !isTestMaterial(call.path) && (call.count <= of.index || (call.unset ?? []).includes(of.index)));
  return calls.length > 0 && calls.every((call) => call.main && call.path === writer);
}

// A root with the rest of a path under it.
function appendRest(value, rest) {
  const restShape = `${globText(rest.text)}${tailOf(rest)}`;
  if (value.open) return restShape === '' ? value : { ...value, tail: `${tailOf(value)}/${restShape}` };
  if (rest.text === '') return rest.open ? { ...value, text: value.text === '' ? '' : `${value.text}/`, open: true, tail: tailOf(rest) } : value;
  const joined = { ...value, text: value.text === '' ? rest.text : `${value.text}/${rest.text}`, open: rest.open, ...(rest.open ? { tail: tailOf(rest) } : {}) };
  return normalizeValue(joined, false) ?? joined;
}

/**
 * The module-level functions of a file whose every returned path is the
 * caller's (the home directory, the working directory, an environment
 * variable or a command-line argument), by name: getGuardianDataPath()
 * returning join(homedir(), '.claude-guardian'). Read with a scratch context,
 * so evaluating them marks nothing seen for the file's own literal reads. A
 * function returning another file's function is two calls away, and is not
 * followed.
 */
function callerRootedFunctions(root, ctx) {
  const scratch = { ...ctx, seen: new Set(), visiting: new Set() };
  const out = {};
  for (const [name, fn] of moduleFunctions(root, ctx.python)) {
    const body = fn.childForFieldName('body');
    const values = (ctx.python
      ? union(returnExpressions(body, 'return_statement', PY_NESTED).map((expr) => evalPy(expr, scratch, 0)))
      : body && body.type !== 'statement_block'
        ? evalJs(body, scratch, 0)
        : union(returnExpressions(body, 'return_statement', JS_FUNCTIONS).map((expr) => evalJs(expr, scratch, 0))));
    // A path under the function's own parameter is the calls' to decide.
    if (values.length > 0 && values.every((value) => outside(value) && !boundParam(value))) out[name] = values.some((value) => value.anchor === 'home') ? 'home' : values[0].anchor;
  }
  return out;
}

function moduleFunctions(root, python) {
  const out = [];
  for (const child of root.namedChildren) {
    if (python) {
      const fn = child.type === 'decorated_definition' ? child.childForFieldName('definition') : child;
      if (fn?.type === 'function_definition') out.push([fn.childForFieldName('name')?.text, fn]);
      continue;
    }
    const declaration = child.type === 'export_statement' ? child.childForFieldName('declaration') : child;
    if (declaration?.type === 'function_declaration') out.push([declaration.childForFieldName('name')?.text, declaration]);
    if (declaration?.type !== 'lexical_declaration' && declaration?.type !== 'variable_declaration') continue;
    for (const declarator of declaration.namedChildren) {
      const value = declarator.type === 'variable_declarator' ? declarator.childForFieldName('value') : null;
      if (value && JS_FUNCTIONS.has(value.type)) out.push([declarator.childForFieldName('name')?.text, value]);
    }
  }
  return out.filter(([name]) => typeof name === 'string' && name !== '');
}

/**
 * The writes and reads whose root another file's function returns, settled
 * now that imports resolve: outside when every such function, followed one
 * call into the file its import names, returns the caller's place; otherwise
 * what the site read with that root unreadable, its landings kept and a path
 * that was only the return counted as built at run time.
 *
 * @param {Iterable<object>} files every file of the map
 */
export function settleHelperPaths(files) {
  const byPath = new Map();
  for (const file of files) byPath.set(file.path, file);
  for (const file of byPath.values()) {
    for (const [pending, kind, outsideCount, dynamicCount] of [['pendingWrites', 'writes', 'outsideWrites', 'dynamicWrites'], ['pendingReads', 'reads', 'outsideReads', 'dynamicReads']]) {
      if (!file[pending]) continue;
      const kept = [];
      for (const { helpers, entries, dynamic } of file[pending]) {
        const theirs = helpers.every((key) => {
          const at = key.lastIndexOf('#');
          const specifier = key.slice(0, at);
          const name = key.slice(at + 1);
          const site = Array.isArray(file.imports) ? file.imports.find((item) => item.specifier === specifier && item.resolved?.outcome === 'file') : null;
          return site != null && byPath.get(site.resolved.path)?.callerRooted?.[name] != null;
        });
        if (theirs) file[outsideCount] = (file[outsideCount] ?? 0) + 1;
        else {
          kept.push(...entries);
          file[dynamicCount] = (file[dynamicCount] ?? 0) + dynamic;
        }
      }
      if (kept.length > 0) file[kind] = sortEntries([...(file[kind] ?? []), ...kept]);
      delete file[pending];
    }
  }
  // settleParamPaths reads callerRooted for the roots calls hand down, and
  // drops it.
}

// A write shaped like no tracked file (a temporary file) places nothing in
// the directory, so a tracked directory made for it stays the evidence; a
// directory made under it with a name built at run time (child) is the
// untracked place those writes go, and goes with them.
function withoutRedundantDirectories(writes, places) {
  return writes.filter((write) => !(
    DIRECTORY_MAKERS.has(write.call) && places.dirs.has(write.target)
    && writes.some((other) => other !== write && other.target.startsWith(`${write.target}/`) && (write.child || !other.target.includes('*')))
  ));
}

// A bare relative path, with nothing fixing where it starts, is relative to
// whoever runs the code; attachLandings decides whose directory that is.
function landingEntry(target, call, value, places) {
  const entry = { target, call, confidence: confidenceOf(value, target, places) };
  if (value.defaultOf) entry.defaultOf = value.defaultOf;
  // A path built from the file's own location with its tail read at run
  // time, which attachLandings keeps for a test when tracked files have its shape.
  if (value.anchor === 'file' && value.open && value.tail != null) entry.fixedHead = true;
  if (DIRECTORY_MAKERS.has(call) && value.open && value.tail != null) entry.child = true;
  if (value.anchor == null && !value.rooted) entry.relative = true;
  if (value.anchor === 'file' && !value.open) entry.fixed = true;
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

/**
 * The one repository path a JavaScript expression names, read the way a
 * landing's path is (literals, joins, __dirname, import.meta.url and
 * same-file bindings), or null when it names none or more than one, or a
 * place that is the caller's. A path with a root the engine cannot read is
 * not one.
 *
 * @param {object} node tree-sitter node
 * @param {string} path the tracked path of the file the node is in
 * @returns {string | null}
 */
/**
 * What a path expression in a build script reads as: `{ path }` when it names
 * one repository path from the file's own location, `{ tail }` when only its
 * end is known, under a root read at run time or the directory the script is
 * run in (core/bundles.js), or null.
 *
 * @param {object} node tree-sitter node
 * @param {string} path the tracked path of the file the node is in
 */
export function pathShape(node, path) {
  if (!node) return null;
  const dir = posix.dirname(path);
  const ctx = { python: false, file: path, dir: dir === '.' ? '' : dir, seen: new Set(), visiting: new Set(), assignments: new Map() };
  const shapes = evalJs(node, ctx, 0).map((value) => {
    if (value.text.includes('://') || isHelper(value)) return null;
    if (!value.open && value.anchor === 'file') {
      const text = posix.normalize(value.text.replaceAll('\\', '/') || '.');
      return text.startsWith('/') || text === '..' || text.startsWith('../') ? null : { path: text.replace(/^\.\//, '') };
    }
    if (!value.open) return value.text === '' ? null : { tail: posix.normalize(value.text.replaceAll('\\', '/')).replace(/^\.\//, '') };
    // The part past the last segment read at run time, when it is whole.
    const known = /(?:^|\/)\*\/([^*?[\]{}]+)$/.exec(`${value.text}${tailOf(value)}`);
    return known ? { tail: known[1] } : null;
  });
  if (shapes.length === 0 || shapes.some((shape) => shape == null)) return null;
  const keys = new Set(shapes.map((shape) => shape.path ?? `*/${shape.tail}`));
  return keys.size === 1 ? shapes[0] : null;
}

export function scriptPath(node, path) {
  const dir = posix.dirname(path);
  const ctx = { python: false, file: path, dir: dir === '.' ? '' : dir, seen: new Set(), visiting: new Set(), assignments: new Map() };
  const values = evalJs(node, ctx, 0);
  if (values.length !== 1) return null;
  const [value] = values;
  if (value.open || value.rooted || outside(value) || isHelper(value) || value.text.includes('://')) return null;
  const text = posix.normalize(value.text.replaceAll('\\', '/') || '.');
  if (text.startsWith('/') || text === '..' || text.startsWith('../')) return null;
  return text === '.' ? '' : text.replace(/^\.\//, '');
}

const API_WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// The Octokit methods that change what they are called on; a get or a list
// reads.
const API_VERBS = /^(create|update|delete|remove|add|set|merge|replace|upload|lock|unlock|transfer|dismiss|submit|approve|cancel|rerun)/;
// The names an Octokit client is bound to: octokit, github-script's github.
const API_CLIENT = /^(?:octokit|github|gh|client|api)$/i;
// Where a call targets the repository it runs in, which is not another one.
const OWN_REPOSITORY = /\bcontext\.repo\b|\bGITHUB_REPOSITORY\b|context\.issue\b/;

/**
 * How many calls in a JavaScript or TypeScript file change repositories
 * other than the one the code runs in through the GitHub API: fetch of an
 * api.github.com URL with a POST, PUT, PATCH or DELETE method, an Octokit
 * method that creates, updates or deletes (octokit.rest.pulls.create), and
 * octokit.request('POST /repos/…'). A call aimed at context.repo or
 * GITHUB_REPOSITORY is the repository's own, and a read changes nothing.
 *
 * @param {object} root tree-sitter root node
 * @returns {number}
 */
export function githubChanges(root) {
  let found = 0;
  walk(root, (node) => {
    if (node.type !== 'call_expression') return;
    const fn = node.childForFieldName('function');
    const args = argumentNodes(node);
    const text = node.childForFieldName('arguments')?.text ?? '';
    if (OWN_REPOSITORY.test(text)) return;
    if (finalName(fn) === 'fetch') {
      if (!/api\.github\.com/.test(args[0]?.text ?? '')) return;
      const method = args[1]?.type === 'object' ? args[1].namedChildren.find((pair) => pair.type === 'pair' && pair.childForFieldName('key')?.text === 'method') : null;
      const value = method?.childForFieldName('value');
      if (value?.type === 'string' && API_WRITES.has(jsStringText(value).toUpperCase())) found += 1;
      return;
    }
    if (fn?.type !== 'member_expression') return;
    const chain = fn.text.split('.').map((part) => part.trim());
    if (!API_CLIENT.test(chain[0]) || chain.length < 2) return;
    const verb = chain[chain.length - 1];
    if (verb === 'request') {
      const route = args[0]?.type === 'string' ? jsStringText(args[0]) : '';
      if (API_WRITES.has(route.split(/\s+/)[0]?.toUpperCase())) found += 1;
      return;
    }
    if (chain.length >= 3 && API_VERBS.test(verb)) found += 1;
  });
  return found;
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

// A file that imports Pillow saves an image with img.save(path).
function importsPillow(root) {
  return root.namedChildren.some((statement) => (
    (statement.type === 'import_from_statement' && /^PIL(\.|$)/.test(statement.childForFieldName('module_name')?.text ?? ''))
    || (statement.type === 'import_statement' && statement.namedChildren.some((child) => /^PIL(\.|$)/.test(child.type === 'aliased_import' ? child.childForFieldName('name')?.text ?? '' : child.text)))
  ));
}

function pythonSite(node, site, pil = false) {
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
  if (pil && attribute === 'save' && args[0]) return site('write', 'save', args[0]);
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
      if (operator === '||' || operator === '??') return fallback(evalJs(left, ctx, next), evalJs(right, ctx, next), ctx.file);
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
      if (object?.text === 'process.env') return environment(property);
      if (object?.type === 'identifier' && CLI_BAGS.has(object.text)) return [atCaller('', 'argument')];
      // input.savePath: a field of what the caller passes is theirs as well.
      if (object?.type === 'identifier' && parameterJs(object.text, node)) return fieldOf(evalJs(object, ctx, next), property ?? null);
      if (object?.type === 'this' && property) return classField(node, property, ctx, next);
      if (object?.type !== 'meta_property') return [];
      if (property === 'url' || property === 'filename') return [anchored(ctx.file)];
      if (property === 'dirname') return [anchored(ctx.dir)];
      return [];
    }
    case 'subscript_expression': {
      const object = node.childForFieldName('object');
      const index = node.childForFieldName('index');
      if (object?.text === 'process.argv' || (object?.type === 'identifier' && CLI_BAGS.has(object.text))) return [atCaller('', 'argument')];
      if (object?.text === 'process.env' && index?.type === 'string') return environment(jsStringText(index));
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
      // process.argv.slice(2), and what a parser is handed it, is still the
      // command line, and so is whatever is destructured from that.
      if (fn?.type === 'member_expression' && (fn.childForFieldName('object')?.text === 'process.argv' || (fn.childForFieldName('object')?.type === 'identifier' && CLI_BAGS.has(fn.childForFieldName('object').text)))) return [atCaller('', 'argument')];
      if (name === 'homedir' && (fn?.type === 'identifier' || fn?.childForFieldName('object')?.text === 'os')) return [atCaller('', 'home')];
      if (JS_TEMP.has(name) && (fn?.type === 'identifier' || fn?.type === 'member_expression')) return [atCaller('', 'temp')];
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
      if (fn?.type === 'identifier') {
        const values = bindArguments(returnsJs(fn.text, node, ctx, next), fn.text, args, ctx, next);
        if (values.length > 0) return values;
        const handed = callerHanded(args, ctx, next, evalJs);
        return handed ? [atCaller('', handed)] : imported(fn.text, node, ctx);
      }
      return [];
    }
    default:
      return [];
  }
}

// A function of this repository whose return this file cannot read, handed
// the caller's place (repoRoot(args.cwd)), returns a place of theirs. The
// arguments are read in a scratch context, so a literal handed over is still
// found as the literal read it is.
function callerHanded(args, ctx, depth, evaluate) {
  const scratch = { ...ctx, seen: new Set(), visiting: new Set(ctx.visiting) };
  for (const arg of args) {
    const values = evaluate(arg, scratch, depth);
    if (values.length > 0 && values.every((value) => outside(value) && !boundParam(value))) return values.some((value) => value.anchor === 'home') ? 'home' : values[0].anchor;
  }
  return null;
}

// A closure is read once per call to it, this many at most.
const CLOSURE_CALLS = 16;

/**
 * What a path inside a closure reads as: a function declared by name inside
 * another function (const put = (relPath) => writeFileSync(join(root,
 * relPath))) is called only from where it is declared, so its parameters are
 * what those calls pass, and the path is read once per call with them bound.
 * The root it captures from the enclosing function reads as it does there: a
 * directory from the command line is still the caller's, one built from the
 * file's own location is still this repository's. A path in any other
 * function reads as before.
 */
function throughClosure(node, ctx) {
  const found = closureOf(node);
  if (found == null) return evalJs(node, ctx, 0);
  const params = found.fn.childForFieldName('parameters')?.namedChildren.filter((param) => param.type !== 'comment') ?? [];
  const single = found.fn.childForFieldName('parameter');
  const names = single ? [single.type === 'identifier' ? single.text : null] : params.map((param) => {
    const pattern = param.type === 'required_parameter' || param.type === 'optional_parameter' ? param.childForFieldName('pattern') : param;
    return pattern?.type === 'identifier' ? pattern.text : null;
  });
  if (!names.some(Boolean) || found.calls.length === 0) return evalJs(node, ctx, 0);
  const lists = [];
  for (const call of found.calls.slice(0, CLOSURE_CALLS)) {
    const args = argumentNodes(call);
    const scratch = { ...ctx, seen: new Set(), visiting: new Set(ctx.visiting) };
    const bound = new Map(ctx.bound ?? []);
    names.forEach((name, index) => {
      if (name != null) bound.set(`${key(found.fn)}:${name}`, args[index] ? evalJs(args[index], scratch, 0) : []);
    });
    lists.push(evalJs(node, { ...ctx, bound }, 0));
  }
  return union(lists);
}

// The innermost function around a node when it is a closure: declared by name
// inside another function's body, with the calls to it in that body. Null
// for a module-level function, whose calls settleParamPaths reads.
function closureOf(node) {
  let fn = null;
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (JS_FUNCTIONS.has(scope.type)) {
      fn = scope;
      break;
    }
  }
  if (fn == null) return null;
  let name = null;
  let block = null;
  if (fn.type === 'function_declaration') {
    name = fn.childForFieldName('name')?.text ?? null;
    block = fn.parent;
  } else if (fn.parent?.type === 'variable_declarator' && fn.parent.childForFieldName('name')?.type === 'identifier') {
    name = fn.parent.childForFieldName('name').text;
    block = fn.parent.parent?.parent;
  }
  if (name == null || block?.type !== 'statement_block') return null;
  const calls = [];
  walk(block, (child) => {
    if (child.type !== 'call_expression') return;
    const callee = child.childForFieldName('function');
    if (callee?.type === 'identifier' && callee.text === name && !(child.startIndex >= fn.startIndex && child.endIndex <= fn.endIndex)) calls.push(child);
  });
  return { fn, calls };
}

// A call to a function of this file binds its parameters: what the function
// returns under a parameter is under the argument the call passes there. An
// argument the engine cannot read leaves that root unread.
function bindArguments(values, name, args, ctx, depth) {
  if (!values.some((value) => boundParam(value) && value.param.fn === name)) return values;
  const scratch = { ...ctx, seen: new Set(), visiting: new Set(ctx.visiting) };
  const out = [];
  for (const value of values) {
    if (!boundParam(value) || value.param.fn !== name) {
      out.push(value);
      continue;
    }
    const passed = passedFor(passedAt(args, value.param.index, scratch, depth), value.param);
    const rest = { text: value.text, open: value.open, ...(value.open && value.tail != null ? { tail: value.tail } : {}) };
    if (passed.length === 0) out.push({ ...rest, rooted: true });
    for (const root of passed) out.push(appendRest(root, rest));
  }
  return cap(out);
}

/**
 * What a parameter reads as: the caller's place, bound to its function and
 * position when that function is a named one at the top of the module, so
 * the calls to it can settle the place (settleParamPaths). A parameter of a
 * callback or a method, or one destructured from an argument object, has no
 * call this map reads, and stays the caller's.
 */
function paramValue(fn, name) {
  const at = parameterIndex(fn, name);
  const owner = moduleFunctionName(fn);
  const param = owner != null && at != null ? { fn: owner, index: at.index, ...(at.field != null ? { field: at.field } : {}) } : null;
  return { text: '', open: false, anchor: 'param', ...(param ? { param } : {}) };
}

// The position of the parameter a name is, and the field when it is
// destructured from an object one level deep: function f(dir) is 0,
// function f({ repoRoot }) is 0 and repoRoot. Null when it is neither.
function parameterIndex(fn, name) {
  const single = fn.childForFieldName('parameter');
  if (single) return single.text === name ? { index: 0 } : null;
  const params = fn.childForFieldName('parameters')?.namedChildren.filter((param) => param.type !== 'comment') ?? [];
  for (let i = 0; i < params.length; i += 1) {
    let param = params[i];
    if (param.type === 'required_parameter' || param.type === 'optional_parameter') param = param.childForFieldName('pattern') ?? param;
    if (param.type === 'assignment_pattern') param = param.childForFieldName('left') ?? param;
    if (param.type === 'identifier' && param.text === name) return { index: i };
    const field = patternField(param, name);
    if (field != null) return { index: i, field };
  }
  return null;
}

// What a call passes at a position: the argument's values, and when it is an
// object literal, what each field it spells out reads as.
function passedAt(args, index, ctx, depth) {
  const node = args[index];
  if (!node) return { values: [] };
  const values = evalJs(node, ctx, depth);
  if (node.type !== 'object') return { values };
  const fields = {};
  for (const child of node.namedChildren) {
    if (child.type === 'shorthand_property_identifier') fields[child.text] = bindingJs(child.text, child, ctx, depth);
    else if (child.type === 'pair') {
      const key = child.childForFieldName('key');
      const name = key?.type === 'property_identifier' ? key.text : key?.type === 'string' ? jsStringText(key) : null;
      if (name != null) fields[name] = evalJs(child.childForFieldName('value'), ctx, depth);
    }
  }
  return { values, fields };
}

// The values a call passes for a parameter, or for the field of it.
function passedFor(arg, param) {
  if (arg == null) return [];
  if (param.field != null) return arg.fields?.[param.field] ?? [];
  return arg.values ?? [];
}

function moduleFunctionName(fn) {
  const atTop = (node) => node?.type === 'program' || (node?.type === 'export_statement' && node.parent?.type === 'program');
  if (fn.type === 'function_declaration') return atTop(fn.parent) ? fn.childForFieldName('name')?.text ?? null : null;
  const declarator = fn.parent;
  if (declarator?.type !== 'variable_declarator' || declarator.childForFieldName('name')?.type !== 'identifier') return null;
  return atTop(declarator.parent?.parent) ? declarator.childForFieldName('name').text : null;
}

const PLACEHOLDER_NAMES = new Set(['.gitkeep', '.keep', '.gitignore']);
const PLACEHOLDERS = new WeakMap();

// A tracked directory every tracked file of which is a placeholder name.
function placeholder(target, places) {
  if (!places.dirs.has(target)) return false;
  let cache = PLACEHOLDERS.get(places);
  if (!cache) {
    cache = new Map();
    PLACEHOLDERS.set(places, cache);
  }
  if (!cache.has(target)) {
    let any = false;
    let only = true;
    for (const path of places.files) {
      if (!path.startsWith(`${target}/`)) continue;
      any = true;
      if (!PLACEHOLDER_NAMES.has(path.slice(path.lastIndexOf('/') + 1))) {
        only = false;
        break;
      }
    }
    cache.set(target, any && only);
  }
  return cache.get(target);
}

// The field of a place: of a parameter the calls bind, that field of what
// they pass; of any other caller's place, still the caller's.
function fieldOf(values, field) {
  if (!(values.length > 0 && values.every(outside))) return [];
  if (field != null && values.length === 1 && boundParam(values[0]) && values[0].param.field == null && values[0].text === '') {
    return [{ ...values[0], param: { ...values[0].param, field } }];
  }
  return [atCaller('', values[0].anchor)];
}

// The property a name is destructured from, in an object pattern one level
// deep: { repoRoot } is repoRoot, { root: repoRoot } is root. Null otherwise.
function patternField(pattern, name) {
  if (pattern?.type !== 'object_pattern') return null;
  for (const child of pattern.namedChildren) {
    if (child.type === 'shorthand_property_identifier_pattern' && child.text === name) return name;
    if (child.type === 'object_assignment_pattern' && child.childForFieldName('left')?.text === name) return name;
    if (child.type === 'pair_pattern') {
      const value = child.childForFieldName('value');
      const target = value?.type === 'assignment_pattern' ? value.childForFieldName('left') : value;
      if (target?.type === 'identifier' && target.text === name) return child.childForFieldName('key')?.text ?? null;
    }
  }
  return null;
}

/**
 * this.path inside a class: what the class gives the field, read from a
 * constructor parameter property's default (constructor(private path =
 * DEFAULT_LOG_PATH)), the field's initializer, and every this.path = ...
 * in the class. A parameter the caller passes without a default is theirs.
 */
function classField(node, name, ctx, depth) {
  let body = null;
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (scope.type === 'class_body') {
      body = scope;
      break;
    }
  }
  if (!body) return [];
  const id = `field:${key(body)}:${name}`;
  if (ctx.visiting.has(id)) return [];
  ctx.visiting.add(id);
  const lists = [];
  for (const member of body.namedChildren) {
    if ((member.type === 'public_field_definition' || member.type === 'field_definition') && member.childForFieldName('name')?.text === name) {
      const value = member.childForFieldName('value');
      if (value) lists.push(evalJs(value, ctx, depth));
    }
    if (member.type === 'method_definition' && member.childForFieldName('name')?.text === 'constructor') {
      for (const param of member.childForFieldName('parameters')?.namedChildren ?? []) {
        const pattern = param.childForFieldName('pattern');
        const modified = param.namedChildren.some((child) => child.type === 'accessibility_modifier' || child.type === 'readonly' || child.text === 'readonly');
        if (!modified || pattern?.text !== name) continue;
        const value = param.childForFieldName('value');
        lists.push(value ? union([[atCaller('', 'param')], evalJs(value, ctx, depth)]) : [atCaller('', 'param')]);
      }
    }
  }
  walk(body, (child) => {
    if (child.type !== 'assignment_expression') return;
    const left = child.childForFieldName('left');
    if (left?.type === 'member_expression' && left.childForFieldName('object')?.type === 'this' && left.childForFieldName('property')?.text === name) {
      lists.push(evalJs(child.childForFieldName('right'), ctx, depth));
    }
  });
  ctx.visiting.delete(id);
  return union(lists);
}

// Whether a name is bound as a parameter of the function around a node.
function parameterJs(name, from) {
  for (let scope = from.parent; scope; scope = scope.parent) {
    if (JS_FUNCTIONS.has(scope.type)) return declaresParameter(scope, name);
    if (JS_BLOCKS.has(scope.type) && findDeclarator(scope, name)) return false;
  }
  return false;
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
    case 'subscript': {
      const value = node.childForFieldName('value');
      if (value?.text === 'sys.argv' || (value?.type === 'identifier' && CLI_BAGS.has(value.text))) return [atCaller('', 'argument')];
      return pyEnvironment(value, node.childForFieldName('subscript'));
    }
    case 'conditional_expression':
      return union([evalPy(node.namedChildren[0], ctx, next), evalPy(node.namedChildren[2], ctx, next)]);
    case 'identifier':
      if (node.text === '__file__') return [anchored(ctx.file)];
      return bindingPy(node.text, node, ctx, next);
    case 'attribute': {
      if (node.childForFieldName('attribute')?.text === 'parent') return dirnameValues(evalPy(node.childForFieldName('object'), ctx, next));
      const object = node.childForFieldName('object');
      if (object?.type === 'identifier' && CLI_BAGS.has(object.text) && !isPythonModule(object.text, node, ctx)) return [atCaller('', 'argument')];
      return [];
    }
    case 'call': {
      const fn = node.childForFieldName('function');
      const args = argumentNodes(node);
      const name = dottedName(fn);
      if (PY_CWD.has(name)) return [atCaller('', 'cwd')];
      if (PY_HOME.has(name)) return [atCaller('', 'home')];
      if (PY_TEMP.has(name)) return [atCaller('', 'temp')];
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
      if (fn?.type === 'identifier') {
        const values = returnsPy(fn.text, node, ctx, next);
        if (values.length > 0) return values;
        const handed = callerHanded(args, ctx, next, evalPy);
        return handed ? [atCaller('', handed)] : imported(fn.text, node, ctx);
      }
      return [];
    }
    default:
      return [];
  }
}

// A call to a function this file imports from a module of its own
// repository, by the specifier the import names, for settleHelperPaths.
function imported(name, from, ctx) {
  ctx.imports ??= ctx.python ? pythonImports(from) : scriptImports(from);
  const found = ctx.imports.get(name);
  return found ? [{ text: '', open: false, anchor: `${HELPER}${found.specifier}#${found.name}` }] : [];
}

function programOf(node) {
  let root = node;
  while (root.parent) root = root.parent;
  return root;
}

// import { a as b } from './x.js': b is x's a. Only a relative specifier is
// a file of this repository; a package's function is not followed.
function scriptImports(node) {
  const out = new Map();
  for (const statement of programOf(node).namedChildren) {
    if (statement.type !== 'import_statement') continue;
    const source = statement.childForFieldName('source');
    const specifier = source?.type === 'string' ? jsStringText(source) : null;
    if (specifier == null || !specifier.startsWith('.')) continue;
    const clause = statement.namedChildren.find((child) => child.type === 'import_clause');
    for (const part of clause?.namedChildren ?? []) {
      if (part.type === 'identifier') out.set(part.text, { specifier, name: 'default' });
      if (part.type !== 'named_imports') continue;
      for (const spec of part.namedChildren) {
        if (spec.type !== 'import_specifier') continue;
        const name = spec.childForFieldName('name')?.text;
        const alias = spec.childForFieldName('alias')?.text ?? name;
        if (name && alias) out.set(alias, { specifier, name });
      }
    }
  }
  return out;
}

// from .paths import data_dir as home: home is that module's data_dir. The
// resolver decides whether the module is this repository's.
function pythonImports(node) {
  const out = new Map();
  for (const statement of programOf(node).namedChildren) {
    if (statement.type !== 'import_from_statement') continue;
    const specifier = statement.childForFieldName('module_name')?.text;
    if (!specifier) continue;
    for (const child of statement.namedChildren) {
      if (child === statement.childForFieldName('module_name')) continue;
      if (child.type === 'dotted_name') out.set(child.text, { specifier, name: child.text });
      if (child.type === 'aliased_import') {
        const name = child.childForFieldName('name')?.text;
        const alias = child.childForFieldName('alias')?.text;
        if (name && alias) out.set(alias, { specifier, name });
      }
    }
  }
  return out;
}

// `import args` would make args a module, whose attributes are not a parse.
function isPythonModule(name, from, ctx) {
  ctx.modules ??= new Set(programOf(from).namedChildren
    .filter((statement) => statement.type === 'import_statement')
    .flatMap((statement) => statement.namedChildren.map((child) => (child.type === 'aliased_import' ? child.childForFieldName('alias')?.text : child.text))));
  return ctx.modules.has(name);
}

// A name resolves to the nearest enclosing declaration of it. Every value
// assigned to that binding in its scope counts, so a let that is reassigned
// from an argument keeps the literal default it started with.
function bindingJs(name, from, ctx, depth) {
  for (let scope = from.parent; scope; scope = scope.parent) {
    // A closure's parameter, while a call to it is read (throughClosure), is
    // what that call passes.
    if (JS_FUNCTIONS.has(scope.type) && ctx.bound?.has(`${key(scope)}:${name}`)) return ctx.bound.get(`${key(scope)}:${name}`);
    // What a function is handed is the caller's place, until the calls to it
    // say otherwise (paramValue).
    if (JS_FUNCTIONS.has(scope.type) && declaresParameter(scope, name)) return [paramValue(scope, name)];
    if (scope.type === 'catch_clause' && scope.childForFieldName('parameter')?.text === name) return [];
    if ((scope.type === 'for_in_statement' || scope.type === 'for_of_statement') && scope.childForFieldName('left')?.text === name) return [];
    const declarator = JS_BLOCKS.has(scope.type) || scope.type === 'for_statement' ? findDeclarator(scope, name) : null;
    if (!declarator) continue;
    const id = `binding:${key(declarator)}`;
    if (ctx.visiting.has(id)) return [];
    // const { savePath } = input: a field of the caller's place is theirs,
    // bound to that field of the argument when the place is a parameter the
    // calls bind; a field of anything else is a value this map cannot read.
    if (declarator.childForFieldName('name')?.type !== 'identifier') {
      ctx.visiting.add(id);
      const whole = evalJs(declarator.childForFieldName('value'), ctx, depth);
      ctx.visiting.delete(id);
      return fieldOf(whole, patternField(declarator.childForFieldName('name'), name));
    }
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
      if ((id?.type === 'object_pattern' || id?.type === 'array_pattern') && patternBinds(id, name)) return declarator;
    }
  }
  return null;
}

function patternBinds(pattern, name) {
  let hit = false;
  const visit = (node) => {
    if (hit || !node) return;
    if (node.type === 'identifier' || node.type === 'shorthand_property_identifier_pattern') {
      if (node.text === name) hit = true;
      return;
    }
    if (node.type === 'pair_pattern') return visit(node.childForFieldName('value'));
    if (node.type === 'assignment_pattern' || node.type === 'object_assignment_pattern') return visit(node.childForFieldName('left'));
    for (const child of node.namedChildren) visit(child);
  };
  visit(pattern);
  return hit;
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

/**
 * What an Astro config with Starlight builds its pages from: the docs content
 * collection under the site's src/content/docs, and each directory a sidebar
 * group autogenerates from (autogenerate: { directory: 'handbook' }).
 */
function starlightReads(root, ctx, places) {
  const docs = ctx.dir ? `${ctx.dir}/src/content/docs` : 'src/content/docs';
  const reads = [];
  let starlight = false;
  walk(root, (node) => {
    const source = node.type === 'import_statement' ? node.childForFieldName('source') : null;
    if (source?.type === 'string' && jsStringText(source) === '@astrojs/starlight') starlight = true;
    if (node.type !== 'pair' || node.childForFieldName('key')?.text !== 'autogenerate') return;
    const value = node.childForFieldName('value');
    for (const pair of value?.type === 'object' ? value.namedChildren : []) {
      if (pair.type !== 'pair' || pair.childForFieldName('key')?.text !== 'directory') continue;
      const directory = pair.childForFieldName('value');
      if (directory?.type !== 'string') continue;
      const target = `${docs}/${jsStringText(directory).replace(/^\.?\/+|\/+$/g, '')}`;
      if (places.dirs.has(target)) reads.push({ target, call: 'autogenerate', confidence: 'ast' });
    }
  });
  if (starlight && places.dirs.has(docs)) reads.push({ target: docs, call: 'content-collection', confidence: 'ast' });
  return reads;
}

// A value relative to where the code is run from ('cwd'), to the home
// directory ('home') or to a temporary directory ('temp') is the caller's
// place, not the repository's: the same line writes somewhere else for every
// person who runs it, and every time.
function atCaller(text, anchor) {
  return { text, open: false, anchor };
}

function outside(value) {
  return value.anchor === 'cwd' || value.anchor === 'home' || value.anchor === 'temp' || value.anchor === 'argument' || value.anchor === 'env' || value.anchor === 'param';
}

function isHelper(value) {
  return typeof value.anchor === 'string' && value.anchor.startsWith(HELPER);
}

function asRoot(value) {
  return { text: value.text, open: value.open, rooted: true };
}

// What an environment variable names as a path: the home directory, the
// working directory, the checkout (which names no place of its own), or a
// place whoever runs the code sets.
function environment(name) {
  if (typeof name !== 'string' || name === '') return [];
  if (HOME_VARIABLES.has(name)) return [atCaller('', 'home')];
  if (name === 'PWD') return [atCaller('', 'cwd')];
  if (WORKSPACE_VARIABLES.has(name)) return [];
  return [atCaller('', 'env')];
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

// dir || '.' is a place the caller passes, or the one they are standing in;
// Path('.') reads as the empty path, and is the same place. A command-line
// argument's default is resolved where the argument would have been, from
// the directory the command runs in: args.out ?? 'report.json' is the
// caller's either way.
function fallback(left, right, file = null) {
  // A parameter's default (dir || '.') is resolved where the parameter would
  // have been, in the same way. A default that is a place of its own (outDir
  // ?? join(here, 'corpus')) is taken only by the calls that leave the
  // parameter out, so it carries the parameter to settleParamPaths.
  const passed = left.length > 0 ? left[0].anchor : null;
  if ((passed === 'argument' || passed === 'param') && left.every((value) => value.anchor === passed)) {
    const param = passed === 'param' && file != null && left.length === 1 && boundParam(left[0]) ? left[0].param : null;
    return union([left, right.map((value) => {
      if (value.anchor == null && !value.rooted && !value.text.includes('://')) return { ...value, anchor: passed };
      return param && !outside(value) && !isHelper(value) ? { ...value, defaultOf: { path: file, fn: param.fn, index: param.index } } : value;
    })]);
  }
  if (left.length > 0) return union([left, right]);
  return right.map((value) => (value.anchor == null && !value.open && !value.rooted && (value.text === '.' || value.text === './' || value.text === '') ? atCaller('', 'cwd') : value));
}

// os.environ['HOME'] and os.getenv('HOME') are the home directory; any other
// variable is a place whoever runs the code sets.
function pyEnvironment(object, name) {
  if (object != null && object.text !== 'os.environ') return [];
  if (name?.type !== 'string') return [];
  return environment(stringTexts(name, true).join(''));
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
  // Another file's return, and a place the caller decides, is only ever read
  // as a root; past the first segment it is a part the engine cannot read.
  for (const values of segments.slice(1).map((list) => list.filter((value) => !isHelper(value) && !outside(value)))) {
    const next = [];
    for (const value of acc) {
      // The path past the part the engine could not read is kept as its
      // shape (see tailOf), which says whether it names tracked files.
      if (value.open) next.push({ ...value, tail: `${tailOf(value)}/${shapeOf(values)}` });
      else if (values.length === 0) next.push({ text: value.text === '' ? '' : `${value.text}/`, open: true, tail: '*', rooted: value.rooted, anchor: value.anchor, ...carried(value) });
      else {
        for (const segment of values) {
          if (absoluteResets && segment.text.startsWith('/')) continue;
          next.push({ text: value.text === '' ? segment.text : `${value.text}/${segment.text}`, open: segment.open, ...(segment.open ? { tail: tailOf(segment) } : {}), rooted: value.rooted, anchor: value.anchor, ...carried(value) });
        }
      }
    }
    acc = cap(next);
  }
  return cap(acc.map((value) => normalizeValue(value, anchored)).filter(Boolean));
}

/**
 * The shape of the path past the first part the engine could not read, as a
 * glob: records/${org}/run-${id}.json is records/, then one unread segment,
 * then run-, an unread part and .json. An open value made before shapes were
 * kept ends in one unread part.
 */
function tailOf(value) {
  return value.open ? (value.tail ?? '*') : '';
}

// One segment's shape: the one value it reads as, or an unread part.
function shapeOf(values) {
  if (values.length !== 1) return '*';
  return `${globText(values[0].text)}${tailOf(values[0])}`;
}

function globText(text) {
  return text.replace(/[*?[\]{}()!+@]/g, '\\$&');
}

const SHAPES = new WeakMap();

/**
 * Whether a path built at run time is shaped like no tracked file: its
 * readable head, the unread parts as wildcards and the names it spells after
 * them (a wave receipt under swarms/<run>/). Such a write makes files this
 * repository does not keep. A shape that spells no name after its unread
 * parts could be any file, and says nothing.
 */
function shapedLikeNothing(value, call, places) {
  if (!value.open || value.tail == null || value.text.includes('://') || landingOf(value, places) == null) return false;
  // A directory a maker names at run time is a new one unless tracked
  // directories have its shape; a file needs a name after the unread part.
  const directory = DIRECTORY_MAKERS.has(call);
  if (!directory && value.tail.replace(/[*/\\]/g, '') === '') return false;
  let text = value.text.replaceAll('\\', '/');
  while (text.startsWith('./')) text = text.slice(2);
  const pattern = `${globText(text)}${value.tail}`;
  let cache = SHAPES.get(places);
  if (!cache) {
    cache = new Map();
    SHAPES.set(places, cache);
  }
  const key = `${directory ? 'dir' : 'file'}\0${pattern}`;
  if (!cache.has(key)) {
    const isMatch = picomatch(pattern, { dot: true });
    const head = text.includes('/') ? text.slice(0, text.lastIndexOf('/') + 1) : '';
    let found = false;
    for (const path of directory ? places.dirs : places.files) {
      if (path.startsWith(head) && isMatch(path)) {
        found = true;
        break;
      }
    }
    cache.set(key, !found);
  }
  return cache.get(key);
}

// The tracked place a write under the working directory names from there:
// the file or directory its whole path spells, or, for a path with a name
// read at run time (.multi-claude/drill/logs/run-N.log), the tracked
// directory it spells whole, when tracked files there have the path's shape.
// A directory a maker makes is evidence of the writes into it, not output of
// its own.
function cwdPlace(value, call, places) {
  if (DIRECTORY_MAKERS.has(call)) return null;
  const spelled = posix.normalize(value.text.replaceAll('\\', '/') || '.').replace(/^\.\//, '');
  if (value.open) {
    if (value.tail == null || !spelled.includes('/')) return null;
    const dir = spelled.slice(0, spelled.lastIndexOf('/'));
    const relative = { text: value.text, open: true, tail: value.tail };
    return places.dirs.has(dir) && !shapedLikeNothing(relative, call, places) ? dir : null;
  }
  const target = spelled.replace(/\/+$/, '');
  return places.files.has(target) || places.dirs.has(target) ? target : null;
}

// Where a write shaped like no tracked file goes: the readable head and the
// first unread segment (swarms/*), a place no one tracks.
function shapedTarget(value) {
  const text = value.text.replaceAll('\\', '/').replace(/^(\.\/)+/, '');
  const firstSegment = value.tail.split('/')[0];
  return `${text}${firstSegment}`;
}

function normalizeValue(value, anchored) {
  if (value.text.includes('://')) return value;
  let text = value.text.replaceAll('\\', '/');
  if (anchored) text = text.replace(/^\/+/, '');
  if (text.startsWith('/')) return null;
  // The caller's directory with a name built at run time is still theirs.
  const kept = outside(value) || isHelper(value);
  const tail = value.open && value.tail != null ? { tail: value.tail } : {};
  if (text === '') return value.open && !kept ? null : { text: '', open: value.open, ...tail, rooted: value.rooted, anchor: value.anchor, ...carried(value) };
  // A trailing slash says the unread part is a segment of its own, which
  // normalize would drop.
  const slash = value.open && text.endsWith('/');
  text = posix.normalize(text);
  if (text === '.' || text === './') text = '';
  if (text === '..' || text.startsWith('../')) return null;
  if (text.startsWith('./')) text = text.slice(2);
  if (slash && text !== '' && !text.endsWith('/')) text += '/';
  if (value.open && text === '' && !kept) return null;
  return { text, open: value.open, ...tail, rooted: value.rooted, anchor: value.anchor, ...carried(value) };
}

function dirnameValues(values) {
  return values
    .map((value) => {
      // Of a path whose tail is built at run time, the directory drops the
      // tail's last segment, or when the tail is all one segment, is the
      // directory the readable head ends in.
      if (value.open && value.tail != null && value.tail.includes('/')) return { ...value, tail: value.tail.slice(0, value.tail.lastIndexOf('/')) };
      if (value.open && value.tail != null && !value.text.includes('://')) {
        const head = value.text.replaceAll('\\', '/');
        const dir = head.includes('/') ? head.slice(0, head.lastIndexOf('/')) : '';
        return { ...closed(dir), rooted: value.rooted, anchor: value.anchor, ...carried(value) };
      }
      if (value.open) return value;
      // The directory of a place the caller decides is theirs too.
      if (value.text === '') return outside(value) ? value : null;
      if (value.text.includes('://')) return null;
      const dir = posix.dirname(value.text);
      return { ...closed(dir === '.' ? '' : dir), rooted: value.rooted, anchor: value.anchor, ...carried(value) };
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
    // A caller's place with no path of its own (an id a helper derives from
    // an argument) is a part the engine cannot read; one with a path, as in
    // `node ${join(process.cwd(), 'dist/cli.js')}`, spells out that path.
    const values = i === 0 ? parts[i] : parts[i].filter((value) => !isHelper(value) && !(outside(value) && value.text === ''));
    if (values.length === 0) {
      const next = parts[i + 1];
      if (i === 0 && next && next.length > 0 && next.every((value) => value.text.startsWith('/'))) {
        rooted = true;
        continue;
      }
      acc = acc.map((value) => (value.open ? { ...value, tail: `${tailOf(value)}*` } : { text: value.text, open: true, tail: '*', rooted: value.rooted, anchor: value.anchor, ...carried(value) }));
      continue;
    }
    const joined = [];
    for (const value of acc) {
      if (value.open) {
        joined.push({ ...value, tail: `${tailOf(value)}${shapeOf(values)}` });
        continue;
      }
      for (const part of values) {
        const text = value.text === '' && (rooted || i > 0) && part.text.startsWith('/') && !part.text.startsWith('//') ? part.text.slice(1) : part.text;
        joined.push({ text: value.text + text, open: part.open, ...(part.open ? { tail: tailOf(part) } : {}), rooted: rooted || value.rooted, anchor: i === 0 ? part.anchor : value.anchor, ...carried(i === 0 ? part : value) });
      }
    }
    acc = cap(joined);
  }
  return acc.filter((value) => !(value.open && value.text === '') || outside(value) || isHelper(value));
}

function defaultKey(of) {
  return `${of.path}#${of.fn}@${of.index}`;
}

function union(lists) {
  return cap(lists.flat());
}

// The parameter a value is rooted at goes with it through every join, and so
// does the parameter whose default it is.
function carried(value) {
  return { ...(value.param ? { param: value.param } : {}), ...(value.defaultOf ? { defaultOf: value.defaultOf } : {}) };
}

function cap(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const id = `${value.open ? 1 : 0}${value.rooted ? 1 : 0}${value.anchor ?? ''}${value.param ? `#${value.param.fn}@${value.param.index}.${value.param.field ?? ''}` : ''}${value.defaultOf ? `=${defaultKey(value.defaultOf)}` : ''}:${value.text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(value);
    if (out.length === MAX_VALUES) break;
  }
  return out;
}

/**
 * The place a value lands on: the path it spells out, the whole of it when it
 * is written out in full, or the directory its last whole segment ends when
 * its tail is built at run time (records/run- is records). That place is
 * where the write goes whether or not it is tracked, so long as a tracked
 * directory holds it: a receipt a script writes beside itself is that
 * receipt, and output under an ignored proofs/output/ is proofs/output, never
 * the tracked proofs/ above it. attachLandings marks the places that are not
 * tracked. A path through a dependency or build directory is not the
 * repository's own, so it keeps to the tracked directory above.
 *
 * @param {{ text: string, open: boolean }} value
 * @param {{ files: Set<string>, dirs: Set<string> }} places
 */
function landingOf(value, places) {
  let text = value.text.replaceAll('\\', '/');
  if (text.startsWith('/')) return null;
  while (text.startsWith('./')) text = text.slice(2);
  if (!value.open) {
    text = posix.normalize(text);
    if (text === '..' || text.startsWith('../')) return null;
  }
  const spelled = value.open ? text.slice(0, Math.max(text.lastIndexOf('/'), 0)) : text.replace(/\/+$/, '');
  if (spelled === '') return null;
  if (places.files.has(spelled) || places.dirs.has(spelled)) return spelled;
  if (spelled.split('/').some((part) => part === 'node_modules' || part === 'dist')) return holdingDirectory(text, places);
  return holdingDirectory(spelled, places) != null ? spelled : null;
}

// Where a write lands. One through a build or dependency directory (a copy
// into packages/cli/dist/) makes that output, which the repository does not
// keep, so it lands there and not on the package above, as a read of it does.
function writtenPlace(value, places) {
  const target = landingOf(value, places);
  if (target == null) return null;
  let text = value.text.replaceAll('\\', '/');
  while (text.startsWith('./')) text = text.slice(2);
  const spelled = value.open ? text.slice(0, Math.max(text.lastIndexOf('/'), 0)) : text.replace(/\/+$/, '');
  const parts = spelled.split('/');
  const at = parts.findIndex((part) => part === 'node_modules' || part === 'dist');
  return at === -1 ? target : parts.slice(0, at + 1).join('/');
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
    unique.set(`${entry.target}\0${entry.call}\0${entry.ref ?? ''}\0${entry.repo ?? ''}\0${entry.confidence}\0${entry.relative ? 1 : 0}\0${(entry.unless ?? []).join(',')}\0${entry.defaultOf ? defaultKey(entry.defaultOf) : ''}`, entry);
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
  // A test writes into temporary copies, except where the path is fixed to
  // the test's own file, written out in full, and names a tracked file
  // outside test material: a test rewriting a committed table under docs/
  // writes this repository, and one writing a scratch file beside itself
  // does not. Only those writes are kept, and none of a test's reads.
  // A test's path built from its own file whose tail is read at run time
  // (materialize.test.ts writing examples/<slug>/<slug>.glyph) rewrites the
  // tracked directory it names when tracked files there have its shape.
  const tests = files.filter((file) => isTestMaterial(file.path))
    .map((file) => ({ path: file.path, reads: file.reads ?? [], writes: (file.writes ?? []).filter((write) => !isTestMaterial(write.target) && (
      (write.fixed && places.files.has(write.target))
      || (write.fixedHead && places.dirs.has(write.target) && !write.target.includes('*'))
      || write.fromCwd
    )) }))
    .filter((file) => file.writes.length > 0)
    .sort((a, b) => compare(a.path, b.path));
  const byPath = new Map([...own, ...tests].map((file) => [file.path, file]));
  // A test reads a place when it names it from the repository root, from its
  // own file, or by raw URL; one built on a root it was handed is its
  // temporary copy's.
  const testReads = files.filter((file) => isTestFile(file.path))
    .map((file) => ({ path: file.path, reads: (file.reads ?? []).filter((read) => read.fixed || read.relative || read.call === 'raw-url') }))
    .filter((file) => file.reads.length > 0)
    .sort((a, b) => compare(a.path, b.path));
  for (const file of files) {
    if (!isTestMaterial(file.path)) continue;
    file.writes = (file.writes ?? []).map(({ fixed, fixedHead, relative, ...rest }) => rest);
    // fromCwd is kept: the page says the place is written from the root.
    file.reads = (file.reads ?? []).map(({ fixed, fixedHead, relative, ...rest }) => rest);
  }

  const writers = new Map();
  const readers = new Map();
  const add = (map, target, entry) => {
    if (!map.has(target)) map.set(target, new Map());
    map.get(target).set(canonicalEntry(entry), entry);
  };
  for (const file of [...own, ...tests]) {
    for (const write of file.writes) {
      const entry = { by: file.path, confidence: write.confidence, ...(write.fromCwd ? { fromCwd: true } : {}) };
      // A write made only when a committed file is absent bootstraps it:
      // it happens once, before the commit, and stamps nothing.
      if (bootstraps(write, places)) entry.unless = ['exists'];
      else if (stamps(file, write.target, places)) entry.stamps = true;
      add(writers, write.target, entry);
    }
  }
  // What git add stages is what a commit may carry, not a write: a place is
  // written by the code a door runs, and a staged place nothing it runs
  // writes is one people write, which the commit carries along.
  // A door writes what its steps' own shell writes, by a redirect or tee
  // (echo 0 > .github/mutmut-baseline.txt), and a staged place its steps
  // name outside git add, as a command handed the path it writes to
  // (check-freshness.sh --out .github/freshness-report.md). A staged place
  // named nowhere else is one people write.
  for (const door of mapped) {
    // A job that commits only on one trigger still commits what it stages.
    door.stagedTargets = stagedTargets([...door.stages, ...(door.gated ?? []).flatMap((entry) => entry.stages)], places);
    const named = new Set(door.mentions.map((mention) => mention.path));
    door.ownWrites = [...new Set([
      ...(door.commands ?? []).filter((command) => command.dir != null)
        .flatMap((command) => shellLandings(command.text, places, { dir: command.dir, follow: true }).writes.map((write) => write.target)),
      ...door.stagedTargets.filter((place) => named.has(place)),
    ])].sort(compare);
    for (const target of door.ownWrites) add(writers, target, { by: door.file });
    for (const mention of door.mentions) add(readers, mention.path, { by: door.file });
  }
  // A place that is not tracked is output the repository does not keep (an
  // ignored directory, a file made at run time), unless a door commits it or
  // it lands in a directory the repository tracks only through a placeholder,
  // which is kept for exactly that output (reports/.gitkeep).
  // A place named by its shape (swarms/*, a temporary file beside a record)
  // is one no tracked file has, so no commit keeps it either.
  const committed = mapped.flatMap((door) => door.stagedTargets);
  const untracked = new Set([...writers.keys(), ...readers.keys()].filter((target) => target.includes('*') || (
    !places.files.has(target) && !places.dirs.has(target) && !keptForOutput(target, places)
    && !committed.some((staged) => target === staged || target.startsWith(`${staged}/`))
  )));
  const spans = partsSpanned(boundaries, [...writers.keys(), ...readers.keys()], places);
  // A text file inside a place something writes is that writer's output: the
  // paths an index or a roadmap names are its data, not places it reads.
  const strong = new Set([...writers]
    .filter(([target, entries]) => !spans.has(target) && !untracked.has(target) && [...entries.values()].some((entry) => entry.confidence !== 'weak'))
    .map(([target]) => target));
  // A tracked file whose every writer reads it first holds a block a script
  // stamps (a version line); people write the rest, so it never makes its
  // part generated.
  const stamped = new Set([...strong].filter((target) => [...writers.get(target).values()].every((entry) => entry.stamps)));
  const output = (path) => [...strong].some((target) => path === target || path.startsWith(`${target}/`));
  for (const file of own) {
    const generated = file.reads.some((read) => read.confidence === 'text') && output(file.path);
    for (const read of file.reads) {
      if (generated && read.confidence === 'text') continue;
      add(readers, read.target, readerEntry(file.path, read));
    }
  }
  // A test that reads a place depends on what is there, as one that imports a
  // module does: it is a reader, marked fromTests, the way a part imported
  // only from tests is counted apart.
  for (const file of testReads) {
    for (const read of file.reads) add(readers, read.target, { ...readerEntry(file.path, read), fromTests: true });
  }
  // Code that imports a module something writes reads that module, and code
  // that loads a manifest reads the manifest.
  for (const file of own) {
    for (const site of Array.isArray(file.imports) ? file.imports : []) {
      const path = site.resolved?.outcome === 'file' ? site.resolved.path : null;
      if (path == null || path === file.path || (!output(path) && !loadsManifest(site))) continue;
      add(readers, path, { by: file.path, call: 'import', confidence: 'ast' });
    }
  }

  const skipped = new Map();
  for (const door of mapped) {
    const targets = new Set(door.ownWrites);
    delete door.ownWrites;
    for (const path of door.reachFiles ?? []) {
      for (const write of byPath.get(path)?.writes ?? []) {
        if (write.confidence === 'weak') continue;
        const guards = guardsHit(door, path, write, places);
        if (guards.length === 0) targets.add(write.target);
        else for (const guard of guards) note(skipped, `${write.target}\0${path}`, guard);
      }
    }
    door.landings = [...targets].filter((target) => !spans.has(target) && !untracked.has(target)).sort(compare);
    const written = (place) => door.landings.some((target) => target === place || target.startsWith(`${place}/`) || place.startsWith(`${target}/`));
    door.unwrittenStages = door.stagedTargets.filter((place) => (places.files.has(place) || places.dirs.has(place)) && !written(place));
    delete door.stagedTargets;
  }
  // A workflow that names a place its own run writes (echo refreshed
  // indexes/latest.json) is describing its output, not reading it.
  for (const door of mapped) {
    for (const target of door.landings) {
      for (const [place, entries] of readers) {
        if (place !== target && !place.startsWith(`${target}/`)) continue;
        entries.delete(canonicalEntry({ by: door.file }));
        if (entries.size === 0 && !writers.has(place)) readers.delete(place);
      }
    }
  }
  for (const door of mapped) {
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
  }

  // A write a door skips for one of the writer's own guards stays on the
  // file's own row, with the guards that kept a door from it.
  for (const [target, entries] of writers) {
    for (const entry of entries.values()) {
      const hit = skipped.get(`${target}\0${entry.by}`);
      if (hit) entry.unless = [...new Set([...(entry.unless ?? []), ...hit])].sort();
    }
  }

  for (const boundary of boundaries) boundary.origin = originOf(boundary, strong, stamped, places);

  return [...new Set([...writers.keys(), ...readers.keys()])].sort(compare).map((target) => {
    const landing = { target, writers: sortedValues(writers.get(target)), readers: sortedValues(readers.get(target)) };
    if (spans.has(target)) landing.spans = spans.get(target);
    if (untracked.has(target)) landing.tracked = false;
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
        const { relative, fixed, ...rest } = entry;
        // Under the working directory is under the person's, for a command
        // people run from wherever they are.
        if (theirs && (relative || entry.fromCwd)) file[count] = (file[count] ?? 0) + 1;
        else if (isTestMaterial(file.path)) kept.push({ ...rest, ...(fixed ? { fixed } : {}), ...(relative ? { relative } : {}) });
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
function originOf(boundary, written, stamped, places) {
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
  const made = (path) => written.has(path) && !stamped.has(path);
  const covered = (root !== '' && made(root)) || (paths.length > 0 && content.every(made));
  const writesItself = boundary.files.some((file) => !isTestMaterial(file.path) && (file.writes?.length ?? 0) > 0);
  return covered && !writesItself ? 'generated' : 'mixed';
}

function keptForOutput(target, places) {
  for (let end = target.lastIndexOf('/'); end > 0; end = target.lastIndexOf('/', end - 1)) {
    const dir = target.slice(0, end);
    if (places.dirs.has(dir)) return places.files.has(`${dir}/.gitkeep`) || places.files.has(`${dir}/.keep`);
  }
  return false;
}

// The guards that are not a flag a run passes (guards.js).
const GUARD_KINDS = new Set(['ci', 'exists', 'main']);

/**
 * The writer's own guards that keep this door's run of the file from a write:
 * a workflow runs with CI set, a file the door only imports is not the
 * program, and a flag every run of the file passes. A
 * file the door only imports carries no flags of its own run, so a flag guard
 * holds only for a file the door runs by name.
 */
function guardsHit(door, path, write, places) {
  const unless = write.unless ?? [];
  if (unless.length === 0) return [];
  const hit = [];
  if (!door.kind && unless.includes('ci')) hit.push('ci');
  // A checkout holds the committed file, so no door's run makes it.
  if (bootstraps(write, places)) hit.push('exists');
  // A write behind a main guard is the file's as a program: made by a door
  // that runs the file, or a file it reaches starts as a child process.
  if (unless.includes('main') && !(door.executed ?? []).includes(path)) hit.push('main');
  const runs = (door.runs ?? []).filter((run) => run.path === path && run.runKind !== 'checks');
  const flags = unless.filter((guard) => !GUARD_KINDS.has(guard));
  if (runs.length > 0 && flags.length > 0 && runs.every((run) => (run.passes ?? []).some((flag) => flags.includes(flag)))) {
    for (const run of runs) for (const flag of run.passes) if (flags.includes(flag)) hit.push(flag);
  }
  return [...new Set(hit)];
}

function note(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

// The write happens only when the file is absent, and the file is committed.
function bootstraps(write, places) {
  return (write.unless ?? []).includes('exists') && places.files.has(write.target);
}

// The writer reads the tracked file's content before it writes the file.
function stamps(file, target, places) {
  if (!places.files.has(target)) return false;
  return (file.reads ?? []).some((read) => read.target === target && CONTENT_READS.has(read.call));
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
