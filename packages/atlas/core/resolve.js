import { builtinModules } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import enhancedResolve from 'enhanced-resolve';
import picomatch from 'picomatch';
import { commandLines, repositoryView } from './commands.js';
import { isTestFile, isTestMaterial } from './landings.js';
import { declaredDependencies, importName } from './python-manifest.js';
import { projectFile, tscOutput } from './tool-configs.js';
import { loadsManifest } from './languages.js';

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx'];
// node16/nodenext TypeScript imports the emitted .js name. The source is the
// .ts file, and it has to win when a checked-in .js sits beside it.
const EXTENSION_ALIAS = {
  '.js': ['.ts', '.tsx', '.js'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
  '.jsx': ['.tsx', '.jsx'],
};
const BUILD_SEGMENTS = new Set(['dist', 'build', 'out']);
const BUILTINS = new Set(builtinModules);

// Top-level names from the Python 3.11, 3.12 and 3.13 standard libraries.
// A bundled list, because resolution must not require a Python interpreter.
const PYTHON_STDLIB = new Set(`
__future__ __main__ _thread abc aifc argparse array ast asynchat asyncio asyncore atexit
audioop base64 bdb binascii bisect builtins bz2 calendar cgi cgitb chunk cmath cmd code
codecs codeop collections colorsys compileall concurrent configparser contextlib contextvars
copy copyreg cProfile crypt csv ctypes curses dataclasses datetime dbm decimal difflib dis
distutils doctest email encodings ensurepip enum errno faulthandler fcntl filecmp fileinput
fnmatch fractions ftplib functools gc getopt getpass gettext glob graphlib grp gzip hashlib
heapq hmac html http idlelib imaplib imghdr imp importlib inspect io ipaddress itertools json
keyword lib2to3 linecache locale logging lzma mailbox mailcap marshal math mimetypes mmap
modulefinder msilib msvcrt multiprocessing netrc nis nntplib numbers operator optparse os
ossaudiodev pathlib pdb pickle pickletools pipes pkgutil platform plistlib poplib posix pprint
profile pstats pty pwd py_compile pyclbr pydoc queue quopri random re readline reprlib resource
rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site smtpd smtplib
sndhdr socket socketserver spwd sqlite3 ssl stat statistics string stringprep struct subprocess
sunau symtable sys sysconfig syslog tabnanny tarfile telnetlib tempfile termios test textwrap
threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty turtle
turtledemo types typing unicodedata unittest urllib uu uuid venv warnings wave weakref
webbrowser winreg winsound wsgiref xdrlib xml xmlrpc zipapp zipfile zipimport zlib zoneinfo
`.split(/\s+/).filter(Boolean));

/**
 * Fill resolved on every import site, recompute unresolvedSites, and derive
 * the inter-boundary edge set. Mutates the file and boundary objects.
 */
export function attachResolution({ repoPath, boundaries, unassigned, overlaps, tracked }) {
  const trackedSet = new Set(tracked);
  const trackedLower = new Map();
  for (const path of trackedSet) trackedLower.set(path.toLowerCase(), path);
  const boundaryByFile = new Map();
  for (const boundary of boundaries) {
    for (const file of boundary.files) boundaryByFile.set(file.path, boundary.name);
  }
  const ctx = createContext(repoPath, trackedSet, trackedLower, boundaryByFile);

  const files = [...boundaries.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps];
  for (const file of files) {
    if (!Array.isArray(file.imports)) continue;
    const fromAbs = join(repoPath, file.path);
    for (const site of file.imports) site.resolved = resolveSite(ctx, fromAbs, file.language, site);
  }

  let unresolved = 0;
  let resolved = 0;
  for (const boundary of boundaries) {
    const counts = countSites(boundary.files);
    boundary.unresolvedSites = counts.unresolved;
    boundary.importConfidence = counts.unresolved > counts.resolved ? 'low' : 'full';
    unresolved += counts.unresolved;
    resolved += counts.resolved;
  }
  for (const file of [...unassigned, ...overlaps]) {
    const counts = countSites([file]);
    unresolved += counts.unresolved;
    resolved += counts.resolved;
  }

  return {
    edges: collectEdges(boundaries, boundaryByFile),
    importConfidence: unresolved > resolved ? 'low' : 'full',
  };
}

function countSites(files) {
  let unresolved = 0;
  let resolved = 0;
  for (const file of files) {
    if (!Array.isArray(file.imports)) continue;
    for (const site of file.imports) {
      const outcome = site.resolved?.outcome;
      if (outcome === 'file' || outcome === 'boundary' || outcome === 'external') resolved += 1;
      else unresolved += 1;
    }
  }
  return { unresolved, resolved };
}

// An edge every one of whose import sites sits in a test file is marked
// fromTests: the part is needed to test the other, not to run it. Test edges
// stay in the set, since they are how a test reaches the part it tests.
function collectEdges(boundaries, boundaryByFile) {
  const byKey = new Map();
  const edges = [];
  for (const boundary of boundaries) {
    for (const file of boundary.files) {
      if (!Array.isArray(file.imports)) continue;
      const fromTest = isTestFile(file.path);
      for (const site of file.imports) {
        const resolved = site.resolved;
        if (!resolved) continue;
        let to = null;
        let kind = null;
        if (resolved.outcome === 'file') {
          if (loadsManifest(site)) continue;
          to = boundaryByFile.get(resolved.path) ?? null;
          kind = 'file';
        } else if (resolved.outcome === 'boundary') {
          to = resolved.boundary;
          kind = 'chunk';
        }
        if (!to || to === boundary.name || !kind) continue;
        const key = `${boundary.name}\0${to}\0${kind}`;
        const known = byKey.get(key);
        if (known) {
          if (!fromTest) delete known.fromTests;
          continue;
        }
        const edge = fromTest ? { from: boundary.name, to, kind, fromTests: true } : { from: boundary.name, to, kind };
        byKey.set(key, edge);
        edges.push(edge);
      }
    }
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind));
  return edges;
}

function resolveSite(ctx, fromAbs, language, site) {
  if (site.kind === 'dynamic' || site.kind === 'wildcard') {
    return { outcome: 'unresolved', reason: site.kind };
  }
  if (site.location) return resolveLocation(ctx, site.specifier);
  if (language === 'python') return resolvePython(ctx, fromAbs, site.specifier);
  return resolveJavaScript(ctx, fromAbs, site.specifier);
}

// A module loaded from a file path (spec_from_file_location) names the file
// itself, relative to the repository root, so the path is the answer.
function resolveLocation(ctx, path) {
  if (ctx.tracked.has(path)) return { outcome: 'file', path };
  const folded = ctx.trackedLower.get(path.toLowerCase());
  if (folded) return { outcome: 'file', path: folded };
  return { outcome: 'unresolved', reason: 'module-not-found' };
}

function createContext(repoPath, tracked, trackedLower, boundaryByFile) {
  const repo = resolve(repoPath);
  const workspaces = workspaceMap(repo, tracked);
  const plugin = workspacePlugin(workspaces);
  const resolvers = new Map();
  let python = null;
  return {
    repo,
    tracked,
    trackedLower,
    boundaryByFile,
    workspaces,
    outputs: () => buildOutputs(repo, tracked),
    // Read once per map, on the first Python site: the roots imports are
    // looked up from and the names the project declares it depends on.
    python() {
      python ??= { roots: sourceRoots(tracked), declared: declaredDependencies(repo, tracked) };
      return python;
    },
    resolverFor(dir) {
      const config = usableConfig(repo, tracked, nearestConfig(repo, dir, tracked));
      const key = config ?? '';
      let resolver = resolvers.get(key);
      if (!resolver) {
        resolver = enhancedResolve.create.sync({
          extensions: EXTENSIONS,
          extensionAlias: EXTENSION_ALIAS,
          conditionNames: ['import', 'require', 'default'],
          symlinks: true,
          tsconfig: config ?? false,
          plugins: [plugin],
        });
        resolvers.set(key, resolver);
      }
      return resolver;
    },
  };
}

// The node_modules walk is what feeds ExportsFieldPlugin. Pointing that step
// at the workspace package directory lets the library apply the exports map,
// including wildcard subpaths, whether or not the package is installed.
function workspacePlugin(workspaces) {
  return {
    apply(resolver) {
      const target = resolver.ensureHook('resolve-as-module');
      resolver.getHook('raw-module').tapAsync('AtlasWorkspacePackages', (request, resolveContext, callback) => {
        const parsed = splitBare(request.request || '');
        if (!parsed) return callback();
        const dir = workspaces.get(parsed.name);
        if (!dir) return callback();
        const obj = {
          ...request,
          path: dir,
          request: parsed.inner,
          module: false,
          fullySpecified: parsed.inner === '.' ? false : request.fullySpecified,
        };
        resolver.doResolve(target, obj, `workspace package ${parsed.name}`, resolveContext, (err, result) => {
          if (err) return callback(err);
          if (result) return callback(null, result);
          callback(new Error(`workspace package ${parsed.name} did not resolve`));
        });
      });
    },
  };
}

function splitBare(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || isAbsolute(specifier)) return null;
  if (specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? (parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null) : parts[0];
  if (!name) return null;
  const rest = specifier.slice(name.length).replace(/^\//, '');
  return { name, inner: rest ? `./${rest}` : '.' };
}

function workspaceMap(repo, tracked) {
  const globs = workspaceGlobs(repo);
  const map = new Map();
  if (globs.length === 0) return map;
  const isMatch = picomatch(globs, { dot: true });
  for (const file of tracked) {
    if (!file.endsWith('/package.json')) continue;
    const dir = file.slice(0, -'/package.json'.length);
    if (!isMatch(dir)) continue;
    try {
      const pkg = JSON.parse(readFileSync(join(repo, file), 'utf8'));
      if (typeof pkg.name === 'string' && pkg.name && !map.has(pkg.name)) map.set(pkg.name, join(repo, dir));
    } catch {
      // An unreadable manifest is not a member the resolver can enter.
    }
  }
  return map;
}

function workspaceGlobs(repo) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  } catch {
    return [];
  }
  const workspaces = pkg.workspaces;
  if (Array.isArray(workspaces)) return workspaces.filter((glob) => typeof glob === 'string');
  if (workspaces && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((glob) => typeof glob === 'string');
  }
  return [];
}

// enhanced-resolve loads a tsconfig's extends chain from disk and throws when
// a target is not installed, which would make every import under that config
// unresolved on a machine without node_modules. A config is used only when
// every file in its extends chain is tracked; otherwise the resolver runs
// without it, which leaves relative and workspace imports identical either way.
function usableConfig(repo, tracked, configPath) {
  if (!configPath) return null;
  let doc;
  try {
    doc = JSON.parse(stripJsonComments(readFileSync(configPath, 'utf8')));
  } catch {
    return configPath;
  }
  const targets = Array.isArray(doc?.extends) ? doc.extends : typeof doc?.extends === 'string' ? [doc.extends] : [];
  for (const target of targets) {
    if (typeof target !== 'string' || !/^\.{0,2}\//.test(target)) return null;
    let abs = resolve(dirname(configPath), target);
    if (!abs.endsWith('.json')) abs += '.json';
    const rel = relative(repo, abs).split(sep).join('/');
    if (!tracked.has(rel)) return null;
    if (usableConfig(repo, tracked, abs) === null) return null;
  }
  return configPath;
}

// The config a file is compiled under is the nearest tracked one: an
// untracked tsconfig is on one machine's disk, and reading it would make the
// map depend on which machine drew it.
function nearestConfig(repo, dir, tracked) {
  const root = resolve(repo);
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  let current = resolve(dir);
  while (current === root || current.startsWith(rootPrefix)) {
    const rel = relative(root, current).split(sep).join('/');
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      if (tracked.has(rel ? `${rel}/${name}` : name)) return join(current, name);
    }
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// A specifier rooted at a drive, the filesystem root or a home directory, or
// a relative one that climbs out of the repository, names a file on one
// machine's disk. Looking it up would make the map depend on which machine
// drew it (E:/AI/synthesis/dist/index.js resolves on the rig and not on a
// runner), so it is never read from disk: it is outside, on every host.
function outsideRepository(ctx, fromAbs, specifier) {
  if (/^[A-Za-z]:[\\/]/.test(specifier) || /^[\\/~]/.test(specifier) || specifier.startsWith('file:')) return true;
  if (!specifier.startsWith('.')) return false;
  const from = relative(ctx.repo, dirname(fromAbs)).replaceAll('\\', '/');
  const target = posix.normalize(from ? `${from}/${specifier}` : specifier);
  return target === '..' || target.startsWith('../');
}

function resolveJavaScript(ctx, fromAbs, specifier) {
  if (outsideRepository(ctx, fromAbs, specifier)) return { outcome: 'external', outside: true };
  const parsed = splitBare(specifier);
  if (specifier.startsWith('node:') || isBuiltin(specifier, parsed)) return { outcome: 'external' };
  // Missing export targets are recorded here. A workspace package whose
  // export points at a build directory can still name its source from the
  // tracked tsconfig when that file has not been emitted.
  const resolveContext = { missingDependencies: new Set() };
  let abs = false;
  try {
    abs = ctx.resolverFor(dirname(fromAbs))(dirname(fromAbs), specifier, resolveContext);
  } catch {
    abs = false;
  }
  if (!abs) {
    const recovered = recoverAbsentBuildOutput(ctx, resolveContext.missingDependencies);
    if (recovered) return recovered;
    if (parsed && ctx.workspaces.has(parsed.name)) {
      return { outcome: 'unresolved', reason: 'workspace-export-unresolved' };
    }
    if (!parsed) return { outcome: 'unresolved', reason: 'module-not-found' };
    return { outcome: 'external' };
  }
  return classifyAbsolute(ctx, abs);
}

function recoverAbsentBuildOutput(ctx, missing) {
  if (!missing || missing.size === 0) return null;
  const hits = new Set();
  let sawBuildTarget = false;
  for (const absPath of missing) {
    const normalized = normalizeWorkspacePath(ctx, absPath);
    const located = locate(ctx, normalized);
    if (located.outside || !located.rel) continue;
    if (!isBuildOutput(ctx, normalized, located.rel)) continue;
    sawBuildTarget = true;
    const rewritten = rewriteOutDir(ctx, normalized, located.rel);
    if (rewritten) hits.add(rewritten);
  }
  if (hits.size === 1) return { outcome: 'file', path: [...hits][0] };
  if (sawBuildTarget) return { outcome: 'unresolved', reason: 'build-output-without-source' };
  return null;
}

// A symlink under node_modules and the workspace directory are the same
// package. Recovery has to see the package path, or the two routes disagree.
function normalizeWorkspacePath(ctx, absPath) {
  const rel = relative(ctx.repo, absPath).replaceAll('\\', '/');
  const marker = 'node_modules/';
  const at = rel.indexOf(marker);
  if (at === -1) return absPath;
  const rest = rel.slice(at + marker.length);
  const parsed = splitBare(rest);
  if (!parsed) return absPath;
  const dir = ctx.workspaces.get(parsed.name);
  if (!dir) return absPath;
  const sub = rest.slice(parsed.name.length).replace(/^\//, '');
  return sub ? join(dir, sub) : dir;
}

function isBuiltin(specifier, parsed) {
  if (BUILTINS.has(specifier) || BUILTINS.has(`node:${specifier}`)) return true;
  if (!parsed || parsed.name.startsWith('@')) return false;
  return BUILTINS.has(parsed.name) || BUILTINS.has(`node:${parsed.name}`);
}

function classifyAbsolute(ctx, absPath) {
  const located = locate(ctx, absPath);
  if (located.outside) return { outcome: 'external' };
  const rel = located.rel;
  if (rel.split('/').includes('node_modules')) return { outcome: 'external' };
  if (isBuildOutput(ctx, absPath, rel)) return mapBuildOutput(ctx, absPath, rel);
  if (located.tracked) return { outcome: 'file', path: located.tracked };
  return { outcome: 'unresolved', reason: 'not-tracked' };
}

function locate(ctx, absPath) {
  let real = absPath;
  try {
    real = realpathSync(absPath);
  } catch {
    real = absPath;
  }
  const rel = relative(ctx.repo, real).replaceAll('\\', '/');
  if (!rel || rel.startsWith('../') || isAbsolute(rel)) return { outside: true, rel };
  if (ctx.tracked.has(rel)) return { rel, tracked: rel };
  const folded = ctx.trackedLower.get(rel.toLowerCase());
  if (folded) return { rel: folded, tracked: folded };
  return { rel, tracked: null };
}

function isBuildOutput(ctx, absPath, rel) {
  if (rel.split('/').some((segment) => BUILD_SEGMENTS.has(segment))) return true;
  return ctx.outputs().some((output) => covers(output.outDir, rel));
}

function covers(dir, rel) {
  return rel === dir || rel.startsWith(`${dir}/`);
}

// A path under dist/ is the compiler's output. The edge has to name source,
// or a boundary when the chunk's sources share one, or nothing.
function mapBuildOutput(ctx, absPath, rel) {
  const sources = trackedSources(ctx, absPath);
  if (sources && sources.length === 1) return { outcome: 'file', path: sources[0] };
  if (sources && sources.length > 1) {
    const boundaries = new Set();
    for (const source of sources) {
      const boundary = ctx.boundaryByFile.get(source);
      if (!boundary) return { outcome: 'unresolved', reason: 'chunk-spans-boundaries' };
      boundaries.add(boundary);
    }
    if (boundaries.size === 1) return { outcome: 'boundary', boundary: [...boundaries][0] };
    return { outcome: 'unresolved', reason: 'chunk-spans-boundaries' };
  }
  const rewritten = rewriteOutDir(ctx, absPath, rel);
  if (rewritten) return { outcome: 'file', path: rewritten };
  return { outcome: 'unresolved', reason: 'build-output-without-source' };
}

// A source map is read only when the repository tracks it. One a build left
// on disk describes that build, and the map would move with it: a clean clone
// and a built one must say the same thing.
function trackedSources(ctx, absPath) {
  const mapPath = relative(ctx.repo, `${absPath}.map`).replaceAll('\\', '/');
  if (!ctx.tracked.has(mapPath)) return null;
  let text;
  try {
    text = readFileSync(`${absPath}.map`, 'utf8');
  } catch {
    return null;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const sources = Array.isArray(json.sources) ? json.sources : [];
  const sourceRoot = typeof json.sourceRoot === 'string' ? json.sourceRoot : '';
  const mapDir = dirname(absPath);
  const found = [];
  const seen = new Set();
  for (const source of sources) {
    if (typeof source !== 'string' || source.startsWith('webpack://')) continue;
    const abs = isAbsolute(source) ? source : join(mapDir, sourceRoot, source);
    const located = locate(ctx, abs);
    if (!located.tracked || seen.has(located.tracked)) continue;
    seen.add(located.tracked);
    found.push(located.tracked);
  }
  return found;
}

/**
 * A declared entry that is not itself tracked. A source map naming one
 * tracked file wins; otherwise the tsconfig outDir is rewritten onto rootDir
 * and a single tracked stem is accepted. The same two steps resolution uses.
 */
export function resolveDeclaredPath(repoPath, rel, tracked) {
  if (!rel) return null;
  const ctx = {
    repo: repoPath,
    tracked,
    trackedLower: new Map([...tracked].map((path) => [path.toLowerCase(), path])),
    outputs: () => buildOutputs(repoPath, tracked),
  };
  const abs = join(repoPath, rel);
  if (isBuildOutput(ctx, abs, rel)) {
    const sources = trackedSources(ctx, abs);
    if (sources && sources.length === 1) return sources[0];
    const rewritten = rewriteOutDir(ctx, abs, rel);
    if (rewritten) return rewritten;
  }
  return tracked.has(rel) ? rel : null;
}

/**
 * Whether a declared path the repository does not track is a build's output:
 * it names what a manifest points people at, so the door stays, built from a
 * source the map cannot place.
 */
export function unplacedBuildOutput(repoPath, rel, tracked) {
  if (!rel || tracked.has(rel)) return false;
  const ctx = { repo: repoPath, tracked, outputs: () => buildOutputs(repoPath, tracked) };
  return isBuildOutput(ctx, join(repoPath, rel), rel);
}

// The source of a path a compile emits, read from the tracked configs alone:
// the one a build script names first, then any whose outDir holds the path.
function rewriteOutDir(ctx, absPath, rel) {
  for (const output of ctx.outputs()) {
    if (!covers(output.outDir, rel)) continue;
    const rewritten = `${output.rootDir}${rel.slice(output.outDir.length)}`.replace(/^\//, '');
    if (ctx.tracked.has(rewritten)) return rewritten;
    const stem = rewritten.replace(/\.[^.]+$/, '');
    const hits = EXTENSIONS.map((ext) => `${stem}${ext}`).filter((path) => ctx.tracked.has(path));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

const OUTPUTS = new WeakMap();

/**
 * Every tracked tsconfig that emits into a directory, with the directory its
 * sources come from, in the order a build output is looked up in: the
 * configs the package scripts hand tsc (-p, --project, -b, --build), the
 * build script's first, then the rest by path. Read once per tracked set.
 */
function buildOutputs(repoPath, tracked) {
  if (OUTPUTS.has(tracked)) return OUTPUTS.get(tracked);
  const repo = repositoryView({ repoPath, tracked });
  const named = [];
  const manifests = [...tracked].filter((path) => (path === 'package.json' || path.endsWith('/package.json')) && !isTestMaterial(path)
    && !path.split('/').includes('node_modules')).sort();
  for (const manifest of manifests) {
    const dir = manifest.includes('/') ? manifest.slice(0, manifest.lastIndexOf('/')) : '';
    const scripts = repo.manifest(dir)?.scripts;
    if (scripts == null || typeof scripts !== 'object') continue;
    const names = Object.keys(scripts).filter((name) => typeof scripts[name] === 'string')
      .sort((a, b) => Number(a !== 'build') - Number(b !== 'build') || (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      for (const project of scriptProjects(scripts[name])) {
        const config = projectFile(repo, dir, project);
        if (config != null && !named.includes(config)) named.push(config);
      }
    }
  }
  const configs = [...tracked].filter((path) => /^(?:tsconfig|jsconfig)(?:[.-][^/]*)?\.json$/.test(path.slice(path.lastIndexOf('/') + 1))
    && !isTestMaterial(path) && !path.split('/').includes('node_modules')).sort();
  const outputs = [...named, ...configs.filter((path) => !named.includes(path))]
    .map((config) => tscOutput(repo, config))
    .filter(Boolean);
  OUTPUTS.set(tracked, outputs);
  return outputs;
}

// The projects one script's tsc commands name.
function scriptProjects(text) {
  const out = [];
  for (const tokens of commandLines(text)) {
    const at = tokens.findIndex((token) => token === 'tsc' || token.endsWith('/tsc'));
    if (at === -1) continue;
    const args = tokens.slice(at + 1);
    if (args[0] === '-b' || args[0] === '--build') {
      const positional = args.slice(1).filter((arg) => !arg.startsWith('-'));
      out.push(...(positional.length > 0 ? positional : ['.']));
      continue;
    }
    for (let i = 0; i < args.length; i += 1) {
      const eq = args[i].indexOf('=');
      const name = eq === -1 ? args[i] : args[i].slice(0, eq);
      if (name !== '-p' && name !== '--project') continue;
      const value = eq === -1 ? args[i + 1] : args[i].slice(eq + 1);
      if (value != null) out.push(value);
    }
  }
  return out;
}

function stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
}

function repoRelative(repo, absPath) {
  const rel = relative(repo, absPath).replaceAll('\\', '/');
  if (!rel || rel.startsWith('../') || isAbsolute(rel)) return null;
  return rel;
}

function resolvePython(ctx, fromAbs, specifier) {
  const fromRel = relative(ctx.repo, fromAbs).replaceAll('\\', '/');
  if (specifier.startsWith('.')) {
    const hit = pythonRelative(fromRel, specifier, ctx.tracked);
    if (hit) return { outcome: 'file', path: hit };
    return { outcome: 'unresolved', reason: 'python-module-not-found' };
  }
  const python = ctx.python();
  const hit = pythonAbsolute(specifier, python.roots, ctx.tracked);
  if (hit) return { outcome: 'file', path: hit };
  const first = specifier.split('.')[0];
  if (PYTHON_STDLIB.has(first)) return { outcome: 'external' };
  const present = segmentPresent(ctx.tracked, first);
  // Python looks a bare name up from the source roots, so a local module of
  // the same name deeper in the tree does not shadow a dependency the project
  // declares: `from datasets import Dataset` beside backpropagate/datasets.py
  // is the library. The site is marked so the page can count those apart.
  if (python.declared.has(importName(first))) return present ? { outcome: 'external', declared: true } : { outcome: 'external' };
  if (!present) return { outcome: 'external' };
  // A name found in the tree but not at a source root, and not declared, is
  // what a sys.path insert makes local; nothing here says which it is.
  return { outcome: 'unresolved', reason: 'python-module-not-found' };
}

/**
 * The tracked file a dotted Python module name is, looked up from the same
 * source roots imports are, or null.
 *
 * @param {string} module
 * @param {Set<string>} tracked
 */
export function resolvePythonModule(module, tracked, roots = []) {
  return pythonAbsolute(module, [...roots, ...sourceRoots(tracked)], tracked);
}

function pythonRelative(fromRel, specifier, tracked) {
  let dots = 0;
  while (specifier[dots] === '.') dots += 1;
  let dir = posixDirname(fromRel);
  for (let i = 1; i < dots; i += 1) {
    if (dir === '') return null;
    dir = posixDirname(dir);
  }
  const rest = specifier.slice(dots);
  if (rest === '') return has(tracked, dir ? `${dir}/__init__.py` : '__init__.py');
  const parts = rest.split('.').filter(Boolean);
  const base = joinPosix(dir, ...parts);
  return has(tracked, `${base}.py`) || has(tracked, `${base}/__init__.py`);
}

function pythonAbsolute(specifier, roots, tracked) {
  const parts = specifier.split('.').filter(Boolean);
  if (parts.length === 0) return null;
  for (const root of roots) {
    const base = joinPosix(root === '.' ? '' : root, ...parts);
    const file = has(tracked, `${base}.py`) || has(tracked, `${base}/__init__.py`);
    if (file) return file;
  }
  return null;
}

// Each packaging directory and its src/, then the repository's own src/ and
// root, which is where a script run from a checkout imports from.
function sourceRoots(tracked) {
  const packaging = [];
  const dirs = new Set();
  for (const file of tracked) {
    const base = file.slice(file.lastIndexOf('/') + 1);
    for (let at = file.indexOf('/'); at !== -1; at = file.indexOf('/', at + 1)) dirs.add(file.slice(0, at));
    if (base !== 'pyproject.toml' && base !== 'setup.py' && base !== 'setup.cfg') continue;
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
    if (!packaging.includes(dir)) packaging.push(dir);
  }
  const roots = [];
  const add = (dir) => {
    if (!roots.includes(dir)) roots.push(dir);
  };
  for (const dir of packaging) {
    const src = dir === '.' ? 'src' : `${dir}/src`;
    if (dirs.has(src)) add(src);
    add(dir);
  }
  if (dirs.has('src')) add('src');
  add('.');
  return roots;
}

function segmentPresent(tracked, name) {
  const file = `${name}.py`;
  for (const path of tracked) {
    if (path === file || path.endsWith(`/${file}`)) return true;
    if (path.split('/').includes(name)) return true;
  }
  return false;
}

function has(tracked, path) {
  return tracked.has(path) ? path : null;
}

function posixDirname(path) {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function joinPosix(dir, ...parts) {
  const head = dir ? dir.split('/') : [];
  return [...head, ...parts].filter((part) => part.length > 0).join('/');
}
