import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import picomatch from 'picomatch';
import { Language, Parser } from 'web-tree-sitter';
import { mapDoors } from './doors.js';
import { deriveEntryPoints } from './entry-points.js';
import { reachFrom } from './reach.js';
import { attachResolution } from './resolve.js';

const GRAMMAR_DIR = fileURLToPath(new URL('../grammars/', import.meta.url));

const LANGUAGE_BY_EXT = new Map([
  ['.js', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.jsx', 'javascript'],
  ['.ts', 'typescript'],
  ['.mts', 'typescript'],
  ['.cts', 'typescript'],
  ['.tsx', 'tsx'],
  ['.py', 'python'],
]);

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

  for (const path of tracked.regular) {
    const file = describeFile(repoPath, path);
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
  for (const boundary of boundaryList) {
    boundary.files.sort(byPath);
    boundary.parseErrors = boundary.files.filter((file) => file.parseError).length;
    boundary.entryPoints = deriveEntryPoints({ repoPath, globs: boundary.globs, tracked: trackedSet });
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

  const doors = mapDoors({ repoPath, tracked: trackedSet });
  const graph = importGraph(boundaryList, unassigned, overlaps);
  for (const door of doors) {
    if (!door.parseError) door.reach = reachFrom(door.runs.map((run) => run.path), graph);
  }

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
  };
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

function describeFile(repoPath, path) {
  const bytes = readFileSync(join(repoPath, path));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const language = LANGUAGE_BY_EXT.get(extname(path).toLowerCase()) ?? null;
  if (language == null) return { path, hash, language: null, imports: 'unavailable' };
  const extracted = extractImports(language, bytes.toString('utf8'));
  if (extracted.parseError) return { path, hash, language, parseError: true, imports: [] };
  return { path, hash, language, imports: extracted.imports };
}

function extractImports(language, source) {
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
    const imports = language === 'python' ? collectPython(tree.rootNode) : collectScript(tree.rootNode);
    return { imports };
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

// A string literal passed to import() or require() is static: the specifier is
// known. importlib.import_module and __import__ stay dynamic even with a
// string, because those calls are unresolved sites by design.
function collectScript(root) {
  const imports = [];
  walkNamed(root, (node) => {
    if (node.type === 'import_statement' || node.type === 'export_statement') {
      const literal = jsString(node.childForFieldName('source'));
      if (literal != null) imports.push({ specifier: literal, kind: 'static', line: lineOf(node) });
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
    if (literal != null) imports.push({ specifier: literal, kind: 'static', line: lineOf(node) });
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

function collectPython(root) {
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
    if (name !== 'importlib.import_module' && name !== '__import__') return;
    const args = node.childForFieldName('arguments');
    const first = args?.namedChildren[0] ?? null;
    imports.push({ specifier: pythonDynamicSpecifier(first), kind: 'dynamic', line: lineOf(node) });
  });
  return imports;
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
  const object = fn.childForFieldName('object');
  const attribute = fn.childForFieldName('attribute');
  if (object?.type === 'identifier' && attribute) return `${object.text}.${attribute.text}`;
  return null;
}

function pythonDynamicSpecifier(node) {
  if (!node) return '';
  if (node.type === 'string') {
    const content = node.namedChildren.find((child) => child.type === 'string_content');
    return content ? content.text : '';
  }
  return node.text;
}
