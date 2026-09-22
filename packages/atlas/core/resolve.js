import { builtinModules } from 'node:module';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import enhancedResolve from 'enhanced-resolve';
import picomatch from 'picomatch';

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx'];
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

function collectEdges(boundaries, boundaryByFile) {
  const seen = new Set();
  const edges = [];
  for (const boundary of boundaries) {
    for (const file of boundary.files) {
      if (!Array.isArray(file.imports)) continue;
      for (const site of file.imports) {
        const resolved = site.resolved;
        if (!resolved) continue;
        let to = null;
        let kind = null;
        if (resolved.outcome === 'file') {
          to = boundaryByFile.get(resolved.path) ?? null;
          kind = 'file';
        } else if (resolved.outcome === 'boundary') {
          to = resolved.boundary;
          kind = 'chunk';
        }
        if (!to || to === boundary.name || !kind) continue;
        const key = `${boundary.name}\0${to}\0${kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from: boundary.name, to, kind });
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
  if (language === 'python') return resolvePython(ctx, fromAbs, site.specifier);
  return resolveJavaScript(ctx, fromAbs, site.specifier);
}

function createContext(repoPath, tracked, trackedLower, boundaryByFile) {
  const repo = resolve(repoPath);
  const workspaces = workspaceMap(repo, tracked);
  const plugin = workspacePlugin(workspaces);
  const resolvers = new Map();
  return {
    repo,
    tracked,
    trackedLower,
    boundaryByFile,
    workspaces,
    resolverFor(dir) {
      const config = nearestConfig(repo, dir);
      const key = config ?? '';
      let resolver = resolvers.get(key);
      if (!resolver) {
        resolver = enhancedResolve.create.sync({
          extensions: EXTENSIONS,
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

function nearestConfig(repo, dir) {
  const root = resolve(repo);
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  let current = resolve(dir);
  while (current === root || current.startsWith(rootPrefix)) {
    const tsconfig = join(current, 'tsconfig.json');
    if (existsSync(tsconfig)) return tsconfig;
    const jsconfig = join(current, 'jsconfig.json');
    if (existsSync(jsconfig)) return jsconfig;
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function resolveJavaScript(ctx, fromAbs, specifier) {
  const parsed = splitBare(specifier);
  if (specifier.startsWith('node:') || isBuiltin(specifier, parsed)) return { outcome: 'external' };
  let abs = false;
  try {
    abs = ctx.resolverFor(dirname(fromAbs))(dirname(fromAbs), specifier);
  } catch {
    abs = false;
  }
  if (!abs) {
    if (parsed && ctx.workspaces.has(parsed.name)) {
      return { outcome: 'unresolved', reason: 'workspace-export-unresolved' };
    }
    if (!parsed) return { outcome: 'unresolved', reason: 'module-not-found' };
    return { outcome: 'external' };
  }
  return classifyAbsolute(ctx, abs);
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
  const config = readCompilerPaths(nearestConfig(ctx.repo, dirname(absPath)));
  if (!config?.outDir) return false;
  const outRel = repoRelative(ctx.repo, config.outDir);
  return outRel != null && (rel === outRel || rel.startsWith(`${outRel}/`));
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

function trackedSources(ctx, absPath) {
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

function rewriteOutDir(ctx, absPath, rel) {
  const config = readCompilerPaths(nearestConfig(ctx.repo, dirname(absPath)));
  if (!config?.outDir || !config?.rootDir) return null;
  const outRel = repoRelative(ctx.repo, config.outDir);
  const rootRel = repoRelative(ctx.repo, config.rootDir);
  if (outRel == null || rootRel == null) return null;
  if (rel !== outRel && !rel.startsWith(`${outRel}/`)) return null;
  const rewritten = `${rootRel}${rel.slice(outRel.length)}`.replace(/^\//, '');
  if (ctx.tracked.has(rewritten)) return rewritten;
  const stem = rewritten.replace(/\.[^.]+$/, '');
  const hits = EXTENSIONS.map((ext) => `${stem}${ext}`).filter((path) => ctx.tracked.has(path));
  if (hits.length === 1) return hits[0];
  return null;
}

function readCompilerPaths(configPath) {
  if (!configPath) return null;
  let text;
  try {
    text = readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
  let json;
  try {
    json = JSON.parse(stripJsonComments(text));
  } catch {
    return null;
  }
  const options = json.compilerOptions ?? {};
  const base = dirname(configPath);
  return {
    outDir: typeof options.outDir === 'string' ? join(base, options.outDir) : null,
    rootDir: typeof options.rootDir === 'string' ? join(base, options.rootDir) : null,
  };
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
  const hit = pythonAbsolute(specifier, sourceRoots(ctx.tracked), ctx.tracked);
  if (hit) return { outcome: 'file', path: hit };
  const first = specifier.split('.')[0];
  if (PYTHON_STDLIB.has(first) || !segmentPresent(ctx.tracked, first)) return { outcome: 'external' };
  return { outcome: 'unresolved', reason: 'python-module-not-found' };
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

function sourceRoots(tracked) {
  const packaging = [];
  for (const file of tracked) {
    const base = file.slice(file.lastIndexOf('/') + 1);
    if (base !== 'pyproject.toml' && base !== 'setup.py' && base !== 'setup.cfg') continue;
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
    if (!packaging.includes(dir)) packaging.push(dir);
  }
  if (packaging.length === 0) return ['.'];
  const roots = [];
  for (const dir of packaging) {
    const src = dir === '.' ? 'src' : `${dir}/src`;
    if ([...tracked].some((file) => file === src || file.startsWith(`${src}/`))) roots.push(src);
    roots.push(dir);
  }
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
