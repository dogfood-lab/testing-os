import { posix } from 'node:path';
import { commandLines } from './commands.js';

/**
 * The files a bundler writes, each with the source it bundles: what a bin or
 * a command names under dist/ when no tsconfig emits it.
 *
 * Two forms are read. A bundler on a package script's command line (esbuild
 * <entry> --outfile=<out> or --outdir=<dir>, tsup <entries> -d <dir>, rollup
 * -i <entry> -o <out>, vite build --ssr <entry> --outDir <dir>), whose paths
 * are the package directory's. And esbuild's API in a script (build() or
 * buildSync() with entryPoints and outfile or outdir), read with the same
 * reader a write's path is. A path the script builds from its own location
 * names the file exactly. A path under a root the script reads at run time
 * (path.join(pkg, 'src', 'cli.ts') with pkg handed in) keeps its known tail,
 * and is read in each package whose scripts run that script, or run one
 * that imports it: the package the build is for. An output there with the
 * name the build writes is that entry's.
 */

const CODE = /\.(?:[cm]?[jt]sx?)$/;
const OUT_EXTENSIONS = ['.js', '.mjs', '.cjs'];
const RUNNERS = new Set(['node', 'tsx', 'ts-node', 'bun', 'vite-node']);
// tsup's flags that take a value, so a value is never read as an entry.
const TSUP_VALUES = new Set(['--format', '--target', '--external', '--platform', '--tsconfig', '--config', '--loader', '--inject',
  '--onSuccess', '--public-dir', '--global-name', '--jsxFactory', '--jsxFragment', '--noExternal', '--env', '--define', '--pure', '--legacy-output']);
const ESBUILD = new Set(['build', 'buildSync', 'context']);

/**
 * The bundles one command line writes, relative to the directory it runs in.
 *
 * @param {string[]} words one command's words
 * @returns {Array<{ out: string, entry: string }>}
 */
export function commandBundles(words) {
  const at = words.findIndex((word, index) => bundler(word) != null && (bundler(word) !== 'vite' || words[index + 1] === 'build'));
  if (at === -1) return [];
  const tool = bundler(words[at]);
  const args = words.slice(tool === 'vite' ? at + 2 : at + 1);
  const value = (names) => {
    for (let i = 0; i < args.length; i += 1) {
      const eq = args[i].indexOf('=');
      const name = eq === -1 ? args[i] : args[i].slice(0, eq);
      if (!names.includes(name)) continue;
      const found = eq === -1 ? args[i + 1] : args[i].slice(eq + 1);
      if (found != null && !found.startsWith('-')) return found;
    }
    return null;
  };
  if (tool === 'esbuild') {
    const entries = args.filter((arg) => !arg.startsWith('-')).map((arg) => (arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : arg)).filter((arg) => CODE.test(arg));
    const out = value(['--outfile']);
    if (out != null && entries.length === 1) return [{ out: clean(out), entry: clean(entries[0]) }];
    const dir = value(['--outdir']);
    return dir != null ? intoDirectory(entries, dir) : [];
  }
  if (tool === 'tsup') {
    const entries = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i].startsWith('-')) {
        if (!args[i].includes('=') && (TSUP_VALUES.has(args[i]) || args[i] === '-d' || args[i] === '--out-dir')) i += 1;
        continue;
      }
      if (CODE.test(args[i])) entries.push(args[i]);
    }
    return intoDirectory(entries, value(['-d', '--out-dir']) ?? 'dist');
  }
  if (tool === 'rollup') {
    const entry = value(['-i', '--input']);
    const out = value(['-o', '--file']);
    if (entry != null && out != null) return [{ out: clean(out), entry: clean(entry) }];
    const dir = value(['-d', '--dir']);
    return entry != null && dir != null ? intoDirectory([entry], dir) : [];
  }
  const entry = value(['--ssr']);
  return entry != null && CODE.test(entry) ? intoDirectory([entry], value(['--outDir']) ?? 'dist') : [];
}

function bundler(word) {
  const base = word.slice(word.lastIndexOf('/') + 1);
  return base === 'esbuild' || base === 'tsup' || base === 'rollup' || base === 'vite' ? base : null;
}

function clean(path) {
  return posix.normalize(path.replace(/^\.\//, ''));
}

// Each entry lands in the directory under the deepest directory all the
// entries share, as esbuild's outbase and tsup's have it.
function intoDirectory(entries, dir) {
  if (entries.length === 0) return [];
  const cleaned = entries.map(clean);
  const dirs = cleaned.map((entry) => posix.dirname(entry).split('/').filter((part) => part !== '.'));
  let shared = dirs[0];
  for (const parts of dirs.slice(1)) {
    let length = 0;
    while (length < shared.length && length < parts.length && shared[length] === parts[length]) length += 1;
    shared = shared.slice(0, length);
  }
  const base = shared.join('/');
  return cleaned.map((entry) => {
    const rel = base === '' ? entry : entry.slice(base.length + 1);
    return { out: posix.join(clean(dir), rel.replace(CODE, '.js')), entry };
  });
}

/**
 * The esbuild API calls in a file, with what each entry and output reads as:
 * `{ path }` for a path the file names exactly, `{ tail }` for the known end
 * of one under a root read at run time.
 *
 * @param {object} root the program node
 * @param {(node: object) => ({ path: string } | { tail: string } | null)} shape
 * @returns {Array<{ entries: object[], out: object|null, outdir: object|null }>}
 */
export function buildCalls(root, shape) {
  const names = esbuildNames(root);
  if (names.calls.size === 0 && names.namespaces.size === 0) return [];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    stack.push(...node.namedChildren);
    if (node.type !== 'call_expression') continue;
    const fn = node.childForFieldName('function');
    const called = fn?.type === 'identifier' ? names.calls.has(fn.text)
      : fn?.type === 'member_expression' && names.namespaces.has(fn.childForFieldName('object')?.text) && ESBUILD.has(fn.childForFieldName('property')?.text);
    if (!called) continue;
    const options = node.childForFieldName('arguments')?.namedChildren[0];
    if (options?.type !== 'object') continue;
    const field = (name) => options.namedChildren.find((pair) => pair.type === 'pair' && pair.childForFieldName('key')?.text === name)?.childForFieldName('value') ?? null;
    const entryNode = field('entryPoints');
    const entries = entryNode?.type === 'array' ? entryNode.namedChildren.map(shape)
      : entryNode?.type === 'object' ? entryNode.namedChildren.filter((pair) => pair.type === 'pair').map((pair) => shape(pair.childForFieldName('value')))
        : [];
    if (entries.length === 0 || entries.some((entry) => entry == null)) continue;
    const outfile = field('outfile');
    const outdir = field('outdir');
    out.push({ entries, out: outfile ? shape(outfile) : null, outdir: outdir ? shape(outdir) : null });
  }
  return out;
}

// import { build } from 'esbuild', and import * as esbuild from 'esbuild'.
function esbuildNames(root) {
  const calls = new Set();
  const namespaces = new Set();
  for (const statement of root.namedChildren) {
    if (statement.type !== 'import_statement') continue;
    const source = statement.childForFieldName('source');
    if (source?.text.slice(1, -1) !== 'esbuild') continue;
    const clause = statement.namedChildren.find((child) => child.type === 'import_clause');
    for (const part of clause?.namedChildren ?? []) {
      if (part.type === 'identifier' || part.type === 'namespace_import') namespaces.add(part.type === 'identifier' ? part.text : part.namedChildren[0]?.text);
      if (part.type !== 'named_imports') continue;
      for (const spec of part.namedChildren) {
        const name = spec.childForFieldName('name')?.text;
        if (ESBUILD.has(name)) calls.add(spec.childForFieldName('alias')?.text ?? name);
      }
    }
  }
  return { calls, namespaces };
}

/**
 * Every output the tracked builds name, with its source, and the builds
 * whose paths are under a root read at run time, with the packages they are
 * read in.
 *
 * @param {{ tracked: Set<string>, manifests: Array<[string, object]>, calls: Map<string, object[]>, imports: Map<string, string[]> }} input
 *   manifests are [directory, scripts]; calls are buildCalls() by file;
 *   imports are each file's relative import specifiers
 */
export function bundleIndex({ tracked, manifests, calls, imports }) {
  const exact = new Map();
  const add = (out, entry) => {
    if (!tracked.has(entry) || tracked.has(out)) return;
    for (const ext of OUT_EXTENSIONS) {
      const path = out.replace(/\.[cm]?js$/, ext);
      if (!exact.has(path)) exact.set(path, entry);
    }
  };
  const runners = new Map();
  for (const [dir, scripts] of manifests) {
    for (const text of Object.values(scripts ?? {})) {
      if (typeof text !== 'string') continue;
      for (const words of commandLines(text)) {
        for (const bundle of commandBundles(words)) add(posix.join(dir, bundle.out), posix.join(dir, bundle.entry));
        const at = words.findIndex((word) => RUNNERS.has(word));
        const script = at === -1 ? null : words.slice(at + 1).find((word) => !word.startsWith('-'));
        if (script == null) continue;
        const path = posix.join(dir, script);
        if (!tracked.has(path)) continue;
        if (!runners.has(path)) runners.set(path, new Set());
        runners.get(path).add(dir);
      }
    }
  }
  // The packages that run a file: those whose scripts run it, or run a
  // file that imports it.
  const packagesOf = (path) => {
    const found = new Set(runners.get(path) ?? []);
    for (const [runner, dirs] of runners) {
      if ((imports.get(runner) ?? []).some((specifier) => relativeTarget(runner, specifier, tracked) === path)) for (const dir of dirs) found.add(dir);
    }
    return [...found].sort();
  };
  const patterns = [];
  for (const [path, found] of [...calls].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    for (const call of found) {
      const outputs = call.out ? [[call.entries[0], call.out]]
        : call.outdir ? call.entries.map((entry) => [entry, joined(call.outdir, stemOf(entry))])
          : [];
      if (call.out && call.entries.length !== 1) continue;
      for (const [entry, out] of outputs) {
        if (out == null) continue;
        if (entry.path != null && out.path != null) add(out.path, entry.path);
        else if (entry.tail != null || out.tail != null) {
          const packages = packagesOf(path);
          if (packages.length > 0) patterns.push({ packages, entry: entry.tail ?? null, entryPath: entry.path ?? null, out: out.tail ?? posix.basename(out.path) });
        }
      }
    }
  }
  return { exact, patterns };
}

// An outdir with the entry's name under it, kept in the outdir's form.
function joined(dir, stem) {
  if (dir.path != null) return { path: posix.join(dir.path, `${stem}.js`) };
  if (dir.tail != null) return { tail: posix.join(dir.tail, `${stem}.js`) };
  return null;
}

function stemOf(entry) {
  const name = posix.basename(entry.path ?? entry.tail);
  return name.replace(CODE, '');
}

function relativeTarget(from, specifier, tracked) {
  if (!specifier.startsWith('.')) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (tracked.has(base)) return base;
  const stem = base.replace(/\.[cm]?js$/, '');
  return ['.ts', '.mts', '.tsx', '.js', '.mjs'].map((ext) => `${stem}${ext}`).find((path) => tracked.has(path)) ?? null;
}

/**
 * The source a bundler's output is built from, or null.
 *
 * @param {{ exact: Map<string, string>, patterns: object[] }} index bundleIndex()
 * @param {string} rel an output path the repository does not track
 * @param {Set<string>} tracked
 */
export function bundledSource(index, rel, tracked) {
  if (index.exact.has(rel)) return index.exact.get(rel);
  const stem = posix.basename(rel).replace(/\.[cm]?js$/, '');
  for (const pattern of index.patterns) {
    if (posix.basename(pattern.out).replace(/\.[cm]?js$/, '') !== stem) continue;
    const outTail = pattern.out.replace(/\.[cm]?js$/, '');
    if (!rel.replace(/\.[cm]?js$/, '').endsWith(`/${outTail}`)) continue;
    for (const dir of pattern.packages) {
      if (dir !== '' && !rel.startsWith(`${dir}/`)) continue;
      const entry = pattern.entryPath ?? posix.join(dir, pattern.entry);
      if (tracked.has(entry)) return entry;
    }
  }
  return null;
}
