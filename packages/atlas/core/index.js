import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import picomatch from 'picomatch';
import { Language, Parser } from 'web-tree-sitter';
import { mapDoors } from './doors.js';
import { deriveEntryPoints, pythonScripts } from './entry-points.js';
import { astLandings, attachLandings, noLandings, pythonPathValues, textLandings, trackedPlaces } from './landings.js';
import { languageOf } from './languages.js';
import { walkReach } from './reach.js';
import { attachResolution } from './resolve.js';
import { attachSequences, sequenceFacts } from './sequence.js';
import { spawnedCommands } from './spawned.js';

const GRAMMAR_DIR = fileURLToPath(new URL('../grammars/', import.meta.url));

const GRAMMAR_FILE = {
  javascript: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  python: 'tree-sitter-python.wasm',
};

// Grammars load when this module evaluates, once per process, and every
// mapRepository call reuses them. That is one load per language rather than
// one load per file; a second call in the same process does not load again.
const runtimeWasm = fileURLToPath(import.meta.resolve('web-tree-sitter/web-tree-sitter.wasm'));
await Parser.init({ locateFile: () => runtimeWasm });
const languages = {};
for (const [name, file] of Object.entries(GRAMMAR_FILE)) {
  languages[name] = await Language.load(readFileSync(join(GRAMMAR_DIR, file)));
}
const parser = new Parser();

/**
 * Map tracked files onto named boundaries.
 *
 * Overlaps are reported and left out of every boundary's file list.
 * Ambiguous ownership is a fact for the human; this function does not pick a winner.
 *
 * @param {{ repoPath: string, boundaries: Array<{ name: string, globs?: string[], status?: string, role?: string }> }} input
 */
export function mapRepository({ repoPath, boundaries } = {}) {
  if (typeof repoPath !== 'string' || repoPath.length === 0) {
    throw new Error('repoPath is required');
  }
  if (!Array.isArray(boundaries)) {
    throw new Error('boundaries must be an array');
  }
  // Resolution compares absolute paths against the repository root, so a
  // relative root ('.') would leave every relative import unresolved.
  repoPath = resolve(repoPath);

  const ordered = boundaries.map(validateBoundary);
  const seen = new Set();
  for (const boundary of ordered) {
    if (seen.has(boundary.name)) {
      throw new Error(`duplicate boundary name: ${boundary.name}`);
    }
    seen.add(boundary.name);
  }
  ordered.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const tracked = listTracked(repoPath);
  const places = trackedPlaces(tracked.regular);
  const matchers = ordered.map((boundary) => ({
    name: boundary.name,
    isMatch: picomatch(boundary.globs, { dot: true }),
  }));

  /** @type {Map<string, { name: string, status: string | undefined, role: string | undefined, globs: string[], files: object[], unresolvedSites: number, parseErrors: number }>} */
  const byName = new Map(
    ordered.map((boundary) => [
      boundary.name,
      {
        name: boundary.name,
        status: boundary.status,
        role: boundary.role,
        globs: boundary.globs,
        files: [],
        unresolvedSites: 0,
        parseErrors: 0,
      },
    ])
  );
  const unassigned = [];
  const overlaps = [];

  // The order of work in a file is read while its tree is alive and finished
  // once imports resolve, so the first reading waits here, keyed by path.
  const facts = new Map();
  const spawned = new Map();
  for (const path of tracked.regular) {
    const file = describeFile(repoPath, path, places, facts, spawned);
    const hits = [];
    for (const matcher of matchers) {
      if (matcher.isMatch(path)) hits.push(matcher.name);
    }
    if (hits.length === 0) unassigned.push(file);
    else if (hits.length === 1) byName.get(hits[0]).files.push(file);
    else overlaps.push({ ...file, boundaries: hits });
  }

  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const trackedSet = new Set(tracked.regular);
  const boundaryList = [...byName.values()];
  const scripts = pythonScripts(repoPath, trackedSet);
  for (const boundary of boundaryList) {
    boundary.files.sort(byPath);
    boundary.parseErrors = boundary.files.filter((file) => file.parseError).length;
    boundary.entryPoints = deriveEntryPoints({ repoPath, globs: boundary.globs, tracked: trackedSet, scripts });
  }
  unassigned.sort(byPath);
  overlaps.sort(byPath);
  tracked.symlinks.sort(byPath);
  tracked.submodules.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const resolution = attachResolution({
    repoPath,
    boundaries: boundaryList,
    unassigned,
    overlaps,
    tracked: tracked.regular,
  });

  const doors = mapDoors({ repoPath, tracked: trackedSet, spawned });
  const graph = importGraph(boundaryList, unassigned, overlaps);
  for (const door of doors) {
    if (door.parseError) continue;
    const walked = walkReach(door.runs.map((run) => run.path), graph);
    door.reach = walked.reach;
    door.reachFiles = walked.files;
  }
  const landings = attachLandings({ files: [...graph.files.values()], doors, boundaries: boundaryList, places });
  for (const door of doors) delete door.reachFiles;
  const entryPoints = new Map(boundaryList.map((boundary) => [boundary.name, [...boundary.entryPoints].sort()]));
  // A console script names the function it calls, which is that file's entry
  // before any rule read from the file itself.
  const entryFunctions = new Map();
  for (const script of scripts) if (script.fn && !entryFunctions.has(script.path)) entryFunctions.set(script.path, script.fn);
  attachSequences({ files: graph.files, facts, doors, entryPoints, entryFunctions });
  attachExports(graph.files, facts);

  return {
    generatedFrom: { repoPath, tracked: tracked.regular.length },
    boundaries: boundaryList,
    unassigned,
    overlaps,
    symlinks: tracked.symlinks,
    submodules: tracked.submodules,
    edges: resolution.edges,
    importConfidence: resolution.importConfidence,
    doors,
    landings,
    spawned,
  };
}

// The names a file hands out, from the same reading the order of work comes
// from. An anonymous default export has no name to compare, so it is not one.
function attachExports(files, facts) {
  for (const [path, fact] of facts) {
    const names = new Set();
    for (const fn of fact.functions) {
      if (fn.moduleLevel && fn.exported && fn.name !== 'default' && fn.name !== '') names.add(fn.name);
    }
    if (names.size > 0) files.get(path).exports = [...names].sort();
  }
}

function importGraph(boundaries, unassigned, overlaps) {
  const files = new Map();
  const boundaryOf = new Map();
  for (const boundary of boundaries) {
    for (const file of boundary.files) {
      files.set(file.path, file);
      boundaryOf.set(file.path, boundary.name);
    }
  }
  for (const file of [...unassigned, ...overlaps]) files.set(file.path, file);
  return { files, boundaryOf };
}

function validateBoundary(boundary) {
  if (boundary == null || typeof boundary.name !== 'string' || boundary.name.trim() === '') {
    throw new Error('boundary name is required');
  }
  const globs = boundary.globs == null ? [] : boundary.globs;
  if (!Array.isArray(globs) || globs.some((glob) => typeof glob !== 'string')) {
    throw new Error(`boundary globs must be an array of strings: ${boundary.name}`);
  }
  return {
    name: boundary.name,
    status: boundary.status,
    role: boundary.role,
    globs: [...globs],
  };
}

function listTracked(repoPath) {
  // -z: without it git octal-escapes and quotes any non-ASCII path, and the
  // core would hash a file that does not exist under that spelling. The buffer
  // is raised because the default 1 MiB is a few tens of thousands of paths,
  // which real repositories in the fleet exceed. --stage is how symlink and
  // gitlink modes are visible; without it both look like ordinary paths.
  const result = spawnSync('git', ['ls-files', '-z', '--stage'], {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.error?.message || '').trim();
    throw new Error(`git ls-files failed: ${detail || `exit ${result.status}`}`);
  }

  const regular = [];
  const symlinks = [];
  const submodules = [];
  for (const line of result.stdout.split('\0')) {
    if (line.length === 0) continue;
    const record = parseStageLine(line);
    // Stage 0 is the resolved index entry. Higher stages are an in-progress
    // merge of the same path, and listing them would count one file three times.
    if (record.stage !== '0') continue;
    if (record.mode === '120000') {
      symlinks.push({ path: record.path, target: symlinkTarget(repoPath, record.path) });
    } else if (record.mode === '160000') {
      submodules.push(record.path);
    } else if (record.mode === '100644' || record.mode === '100755') {
      regular.push(record.path);
    } else {
      throw new Error(`unsupported index mode ${record.mode} for ${record.path}`);
    }
  }
  return { regular, symlinks, submodules };
}

function parseStageLine(line) {
  const tab = line.indexOf('\t');
  if (tab === -1) throw new Error('git ls-files --stage line has no path');
  const meta = line.slice(0, tab).split(' ');
  if (meta.length !== 3) throw new Error(`git ls-files --stage line is not mode oid stage: ${line}`);
  return {
    mode: meta[0],
    oid: meta[1],
    stage: meta[2],
    path: line.slice(tab + 1).replaceAll('\\', '/'),
  };
}

function symlinkTarget(repoPath, path) {
  try {
    return readlinkSync(join(repoPath, path)).replaceAll('\\', '/');
  } catch {
    // The index says this path is a symlink. A worktree that cannot read the
    // link is still not a file to hash, and the walk must not throw on it.
    return null;
  }
}

function describeFile(repoPath, path, places, facts, spawned) {
  const bytes = readFileSync(join(repoPath, path));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const language = languageOf(path);
  if (language == null) return { path, hash, language: null, imports: 'unavailable', ...textLandings(path, bytes, places) };
  const extracted = parseFile(language, path, bytes.toString('utf8'), places);
  if (extracted.parseError) return { path, hash, language, parseError: true, imports: [], ...noLandings() };
  facts.set(path, extracted.sequence);
  if (extracted.spawned.length > 0) spawned.set(path, extracted.spawned);
  return { path, hash, language, imports: extracted.imports, ...extracted.landings };
}

// One parse serves every reading of a file: its imports, its landings, the
// order of the calls it makes and the commands it hands a child process.
function parseFile(language, path, source, places) {
  let tree;
  try {
    parser.setLanguage(languages[language]);
    tree = parser.parse(source);
  } catch {
    return { parseError: true, imports: [] };
  }
  if (tree == null) return { parseError: true, imports: [] };
  try {
    if (tree.rootNode.hasError) return { parseError: true, imports: [] };
    const imports = language === 'python' ? collectPython(tree.rootNode, path, places) : collectScript(tree.rootNode);
    return {
      imports,
      landings: astLandings(language, tree.rootNode, path, places),
      sequence: sequenceFacts(language, tree.rootNode),
      spawned: language === 'python' ? [] : spawnedCommands(tree.rootNode),
    };
  } finally {
    tree.delete();
  }
}

function walkNamed(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    visit(node);
    const children = node.namedChildren;
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
}

function lineOf(node) {
  return node.startPosition.row + 1;
}

// A string literal passed to import() or require() names its module as surely
// as an import statement does, so it resolves as one, kind dynamic-literal.
// Anything else passed is a dynamic site, left unresolved.
function collectScript(root) {
  const imports = [];
  walkNamed(root, (node) => {
    if (node.type === 'import_statement' || node.type === 'export_statement') {
      const literal = jsString(node.childForFieldName('source'));
      if (literal == null) return;
      const site = { specifier: literal, kind: 'static', line: lineOf(node) };
      // export * from './x' hands on every name x exports, which is what a
      // barrel index does; export * as ns names one binding, so it is not.
      if (node.type === 'export_statement' && node.children.some((child) => child.type === '*')) site.reexportsAll = true;
      imports.push(site);
      return;
    }
    if (node.type !== 'call_expression') return;
    const fn = node.childForFieldName('function');
    if (!fn) return;
    const isImport = fn.type === 'import';
    const isRequire = fn.type === 'identifier' && fn.text === 'require';
    if (!isImport && !isRequire) return;
    const args = node.childForFieldName('arguments');
    const first = args?.namedChildren[0] ?? null;
    const literal = jsString(first);
    if (literal != null) imports.push({ specifier: literal, kind: 'dynamic-literal', line: lineOf(node) });
    else imports.push({ specifier: first ? first.text : '', kind: 'dynamic', line: lineOf(node) });
  });
  return imports;
}

function jsString(node) {
  if (!node || node.type !== 'string') return null;
  const parts = node.namedChildren.filter((child) => child.type === 'string_fragment');
  if (parts.length === 0) return node.text === "''" || node.text === '""' ? '' : null;
  return parts.map((part) => part.text).join('');
}

const PYTHON_IMPORT_CALLS = new Set(['importlib.import_module', 'import_module', '__import__']);
const PYTHON_LOCATION_CALLS = new Set(['importlib.util.spec_from_file_location', 'util.spec_from_file_location', 'spec_from_file_location']);

// importlib.import_module and __import__ with a string literal name their
// module; spec_from_file_location names its file, read the way a landing's
// path is read (joins, __file__, .parent), and counts when that is exactly
// one tracked file. Either is kind dynamic-literal and resolves as an import.
function collectPython(root, path, places) {
  const imports = [];
  walkNamed(root, (node) => {
    if (node.type === 'import_statement') {
      for (const child of node.namedChildren) {
        const specifier = pythonImported(child);
        if (specifier == null) continue;
        imports.push({ specifier, kind: 'static', line: lineOf(node) });
      }
      return;
    }
    if (node.type === 'import_from_statement') {
      const module = node.childForFieldName('module_name');
      if (!module) return;
      const wildcard = node.namedChildren.some((child) => child.type === 'wildcard_import');
      imports.push({
        specifier: module.text,
        kind: wildcard ? 'wildcard' : 'static',
        line: lineOf(node),
      });
      return;
    }
    if (node.type !== 'call') return;
    const name = pythonCallee(node.childForFieldName('function'));
    const args = node.childForFieldName('arguments');
    if (PYTHON_IMPORT_CALLS.has(name)) {
      const first = args?.namedChildren[0] ?? null;
      const literal = pythonLiteral(first);
      if (literal) imports.push({ specifier: literal, kind: 'dynamic-literal', line: lineOf(node) });
      else imports.push({ specifier: pythonDynamicSpecifier(first), kind: 'dynamic', line: lineOf(node) });
      return;
    }
    if (!PYTHON_LOCATION_CALLS.has(name)) return;
    const location = pythonArgument(args, 1, 'location');
    const named = location ? [...new Set(pythonPathValues(location, path))].filter((value) => places.files.has(value)) : [];
    if (named.length === 1) imports.push({ specifier: named[0], kind: 'dynamic-literal', line: lineOf(node), location: true });
    else imports.push({ specifier: location ? location.text : '', kind: 'dynamic', line: lineOf(node) });
  });
  return imports;
}

function pythonLiteral(node) {
  if (node?.type !== 'string') return null;
  if (node.namedChildren.some((child) => child.type === 'interpolation' || child.type === 'escape_sequence')) return null;
  const text = node.namedChildren.filter((child) => child.type === 'string_content').map((child) => child.text).join('');
  return text === '' ? null : text;
}

function pythonArgument(args, index, keyword) {
  if (!args) return null;
  const children = args.namedChildren.filter((child) => child.type !== 'comment');
  const named = children.find((child) => child.type === 'keyword_argument' && child.childForFieldName('name')?.text === keyword);
  if (named) return named.childForFieldName('value');
  const positional = children.filter((child) => child.type !== 'keyword_argument');
  return positional[index] ?? null;
}

function pythonImported(node) {
  if (node.type === 'dotted_name' || node.type === 'relative_import') return node.text;
  if (node.type === 'aliased_import') return node.childForFieldName('name')?.text ?? null;
  return null;
}

function pythonCallee(fn) {
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type !== 'attribute') return null;
  const object = pythonCallee(fn.childForFieldName('object'));
  const attribute = fn.childForFieldName('attribute');
  return object && attribute ? `${object}.${attribute.text}` : null;
}

function pythonDynamicSpecifier(node) {
  if (!node) return '';
  if (node.type === 'string') {
    const content = node.namedChildren.find((child) => child.type === 'string_content');
    return content ? content.text : '';
  }
  return node.text;
}
