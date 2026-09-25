import { posix } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * What a test runner, type checker or linter reads when a door names no file
 * to it: the configuration it finds, and the patterns that configuration
 * spells. Every reader here is literal. A pattern computed at run time, a
 * configuration that is a function, or a preset it inherits from a package
 * is not read, and the reader falls back to what the tool does by default.
 *
 * Each reader returns patterns and places relative to the repository root,
 * with the configuration file it read (or null when it used the defaults),
 * so the caller can match them against the tracked files and say where the
 * files came from.
 */

export const VITEST_CONFIGS = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.cts', 'vitest.config.js', 'vitest.config.mjs', 'vitest.config.cjs', 'vite.config.ts', 'vite.config.mts', 'vite.config.cts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];
const VITEST_INCLUDE = ['**/*.{test,spec}.?(c|m)[jt]s?(x)'];
const VITEST_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*'];
const JEST_CONFIGS = ['jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'jest.config.cjs', 'jest.config.json'];
const JEST_MATCH = ['**/__tests__/**/*.?([mc])[jt]s?(x)', '**/?(*.)+(spec|test).?([mc])[jt]s?(x)'];
const MOCHA_CONFIGS = ['.mocharc.js', '.mocharc.cjs', '.mocharc.yaml', '.mocharc.yml', '.mocharc.jsonc', '.mocharc.json'];
const ESLINT_CONFIGS = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts'];
const PYTEST_CONFIGS = ['pytest.ini', '.pytest.ini', 'pyproject.toml', 'tox.ini', 'setup.cfg'];
// node --test with no path runs these, relative to where it starts.
export const NODE_TEST_DEFAULTS = ['**/*.test.{cjs,mjs,js}', '**/*-test.{cjs,mjs,js}', '**/*_test.{cjs,mjs,js}', '**/test-*.{cjs,mjs,js}', '**/test.{cjs,mjs,js}', '**/test/**/*.{cjs,mjs,js}'];
export const PYTEST_DEFAULTS = ['**/test_*.py', '**/*_test.py'];
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

function join(dir, path) {
  const joined = posix.normalize(dir ? `${dir}/${path}` : path).replace(/\/+$/, '');
  if (joined === '.' || joined === '') return '';
  return joined.startsWith('../') || joined === '..' ? null : joined;
}

function firstTracked(repo, dir, names) {
  for (const name of names) {
    const path = join(dir, name);
    if (path != null && repo.tracked.has(path)) return path;
  }
  return null;
}

/* ---------- JSON with comments ---------- */

/**
 * JSON as tsconfig and .mocharc.jsonc write it: comments and trailing commas
 * allowed. Returns null for anything that still does not parse.
 */
export function parseJsonc(text) {
  if (typeof text !== 'string') return null;
  const kept = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      const end = stringEnd(text, i, '"');
      kept.push(text.slice(i, end + 1));
      i = end;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i + 1 < text.length && text[i + 1] !== '\n') i += 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
    } else if (ch === ',') {
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) next += 1;
      if (text[next] !== '}' && text[next] !== ']') kept.push(ch);
    } else kept.push(ch);
  }
  try {
    return JSON.parse(kept.join(''));
  } catch {
    return null;
  }
}

function stringEnd(text, open, quote) {
  for (let i = open + 1; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === quote) return i;
  }
  return text.length - 1;
}

/* ---------- literals in a JavaScript configuration ---------- */

// The source with its comments blanked, so a commented-out pattern is not
// read. Strings keep their text; a slash inside one is not a comment.
function withoutComments(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = stringEnd(text, i, ch);
      out.push(text.slice(i, end + 1));
      i = end;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i + 1 < text.length && text[i + 1] !== '\n') i += 1;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
    } else out.push(ch);
  }
  return out.join('');
}

function closing(src, open) {
  const pairs = { '{': '}', '[': ']', '(': ')' };
  const stack = [];
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = stringEnd(src, i, ch);
    } else if (pairs[ch]) {
      stack.push(pairs[ch]);
    } else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return src.length - 1;
}

/**
 * The keys an object literal holds directly, each with where its value
 * starts. A key inside a nested object is that object's, not this one's:
 * vitest's coverage.exclude is not test.exclude.
 */
function ownKeys(src, open) {
  const end = closing(src, open);
  const keys = new Map();
  let depth = 0;
  for (let i = open + 1; i < end; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const close = stringEnd(src, i, ch);
      if (depth === 0) {
        const after = /^\s*:/.exec(src.slice(close + 1, close + 40));
        if (after && !keys.has(src.slice(i + 1, close))) keys.set(src.slice(i + 1, close), close + 1 + after[0].length);
      }
      i = close;
    } else if ('{[('.includes(ch)) depth += 1;
    else if ('}])'.includes(ch)) depth -= 1;
    else if (depth === 0 && /[A-Za-z_$]/.test(ch) && !/[\w$]/.test(src[i - 1] ?? '')) {
      const word = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))[0];
      const after = /^\s*:/.exec(src.slice(i + word.length, i + word.length + 40));
      if (after && !keys.has(word)) keys.set(word, i + word.length + after[0].length);
      i += word.length - 1;
    }
  }
  return keys;
}

/**
 * The string literals a value spells: one string, or an array of them.
 * `complete` is false when the array also holds something else, a spread
 * of the tool's defaults or a computed entry, so the caller knows the list
 * it has is not the whole list.
 */
function stringsAt(src, at) {
  let i = at;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const single = stringLiteral(src, i);
  if (single) return { values: [single.value], complete: true };
  if (src[i] !== '[') return null;
  const end = closing(src, i);
  const values = [];
  let complete = true;
  let j = i + 1;
  while (j < end) {
    while (j < end && /[\s,]/.test(src[j])) j += 1;
    if (j >= end) break;
    const found = stringLiteral(src, j);
    if (found) {
      values.push(found.value);
      j = found.end + 1;
      continue;
    }
    complete = false;
    let depth = 0;
    while (j < end && !(depth === 0 && src[j] === ',')) {
      if ('{[('.includes(src[j])) depth += 1;
      else if ('}])'.includes(src[j])) depth -= 1;
      else if (src[j] === '"' || src[j] === "'" || src[j] === '`') j = stringEnd(src, j, src[j]);
      j += 1;
    }
  }
  return { values, complete };
}

function stringLiteral(src, i) {
  const quote = src[i];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;
  const end = stringEnd(src, i, quote);
  const body = src.slice(i + 1, end);
  if (quote === '`' && body.includes('${')) return null;
  return { value: body.replace(/\\(.)/g, '$1'), end };
}

// The object a key holds, when it holds one written out.
function objectAt(src, at) {
  let i = at;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  return src[i] === '{' ? i : -1;
}

// Every value of `key` anywhere in the source, for configurations whose keys
// do not nest under one another (eslint's ignores, jest's testMatch).
function everyStrings(src, key) {
  const out = [];
  const pattern = new RegExp(`(?:^|[\\s{,(])(["']?)${key}\\1\\s*:`, 'g');
  for (const match of src.matchAll(pattern)) {
    const found = stringsAt(src, match.index + match[0].length);
    if (found) out.push(...found.values);
  }
  return out;
}

/* ---------- tsconfig ---------- */

function readTsconfig(repo, path, seen = new Set()) {
  if (seen.has(path) || seen.size > 8) return null;
  seen.add(path);
  const json = parseJsonc(repo.text(path));
  if (json == null || typeof json !== 'object') return null;
  const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);
  const own = {
    include: Array.isArray(json.include) ? { dir, list: json.include.filter((item) => typeof item === 'string') } : null,
    exclude: Array.isArray(json.exclude) ? { dir, list: json.exclude.filter((item) => typeof item === 'string') } : null,
    files: Array.isArray(json.files) ? { dir, list: json.files.filter((item) => typeof item === 'string') } : null,
    references: Array.isArray(json.references)
      ? json.references.map((ref) => ref?.path).filter((ref) => typeof ref === 'string')
      : [],
    dir,
  };
  // include, exclude and files are inherited through a relative extends and
  // stay relative to the file that wrote them; references are never inherited.
  const bases = (Array.isArray(json.extends) ? json.extends : [json.extends]).filter((item) => typeof item === 'string' && item.startsWith('.'));
  for (const base of bases) {
    let target = join(dir, base);
    if (target == null) continue;
    if (!target.endsWith('.json')) target = repo.tracked.has(`${target}.json`) ? `${target}.json` : `${target}/tsconfig.json`;
    const inherited = readTsconfig(repo, target, seen);
    if (!inherited) continue;
    for (const field of ['include', 'exclude', 'files']) if (own[field] == null) own[field] = inherited[field];
  }
  return own;
}

export function projectFile(repo, dir, value) {
  const path = join(dir, value);
  if (path == null) return null;
  if (path.endsWith('.json') && repo.tracked.has(path)) return path;
  const inside = path === '' ? 'tsconfig.json' : `${path}/tsconfig.json`;
  return repo.tracked.has(inside) ? inside : null;
}

/**
 * Where a tsconfig emits and what it emits from, as the compiler resolves
 * them: outDir and rootDir, each relative to the file that wrote it and
 * inherited through a relative extends. Without a rootDir the compiler takes
 * the deepest directory holding every source it compiles, which is read from
 * the tracked files the config selects. A config with no outDir emits beside
 * its sources, so it names no output directory and is null.
 *
 * @returns {{ config: string, outDir: string, rootDir: string } | null}
 */
export function tscOutput(repo, path) {
  const options = compilerPaths(repo, path);
  if (options == null || !options.outDir) return null;
  let rootDir = options.rootDir;
  if (rootDir == null) {
    const found = tscTargets(repo, '', path, { build: false });
    const files = [
      ...[...found.directories].flatMap((dir) => repo.filesUnder(dir)),
      ...found.patterns.flatMap((pattern) => repo.filesMatching('', pattern.globs, pattern.exclude)),
    ];
    const typed = files.filter((file) => TS_EXTENSIONS.some((ext) => file.endsWith(ext)) && !/\.d\.[cm]?ts$/.test(file));
    const sources = typed.length > 0 || !options.allowJs ? typed : files.filter((file) => /\.[cm]?jsx?$/.test(file));
    rootDir = sources.length > 0 ? commonDirectory(sources) : posix.dirname(path) === '.' ? '' : posix.dirname(path);
  }
  return { config: path, outDir: options.outDir, rootDir };
}

/**
 * Whether tsc run on a config writes JavaScript somewhere a later step can
 * load it: an outDir, the config's or the flag's, and no noEmit, the
 * config's or the flag's. Beside its sources is no build a person names.
 *
 * @param {{ outDir?: boolean, noEmit?: boolean }} flags what the command line sets
 */
export function tscEmits(repo, path, flags = {}) {
  if (flags.noEmit) return false;
  const options = compilerPaths(repo, path);
  if (options == null || options.noEmit === true) return false;
  return Boolean(flags.outDir || options.outDir);
}

function compilerPaths(repo, path, seen = new Set()) {
  if (seen.has(path) || seen.size > 8) return null;
  seen.add(path);
  const json = parseJsonc(repo.text(path));
  if (json == null || typeof json !== 'object') return null;
  const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);
  const options = json.compilerOptions != null && typeof json.compilerOptions === 'object' ? json.compilerOptions : {};
  // A directory outside the repository is no place a tracked source can be
  // mapped from, so it is read as unset rather than as the root.
  const own = {
    outDir: typeof options.outDir === 'string' ? join(dir, options.outDir) : undefined,
    rootDir: typeof options.rootDir === 'string' ? join(dir, options.rootDir) : undefined,
    allowJs: typeof options.allowJs === 'boolean' ? options.allowJs : undefined,
    noEmit: typeof options.noEmit === 'boolean' ? options.noEmit : undefined,
  };
  const bases = (Array.isArray(json.extends) ? json.extends : [json.extends]).filter((item) => typeof item === 'string' && item.startsWith('.'));
  for (const base of bases) {
    let target = join(dir, base);
    if (target == null) continue;
    if (!target.endsWith('.json')) target = repo.tracked.has(`${target}.json`) ? `${target}.json` : `${target}/tsconfig.json`;
    const inherited = compilerPaths(repo, target, seen);
    if (!inherited) continue;
    for (const field of ['outDir', 'rootDir', 'allowJs', 'noEmit']) if (own[field] === undefined) own[field] = inherited[field];
  }
  return own;
}

function commonDirectory(files) {
  const split = files.map((file) => file.split('/').slice(0, -1));
  let length = 0;
  while (split.every((parts) => parts.length > length && parts[length] === split[0][length])) length += 1;
  return split[0].slice(0, length).join('/');
}

/**
 * The places a tsc invocation compiles. `project` is the tsconfig path or
 * directory the command names, relative to `cwd`; `build` follows the
 * project references the way tsc --build does.
 *
 * An include entry that names a directory is recorded as that directory;
 * one that is a file pattern is matched against the tracked files. A
 * project with neither include nor files compiles everything under its
 * directory, which is recorded as the directory.
 */
export function tscTargets(repo, cwd, project, { build }) {
  const root = projectFile(repo, cwd, project ?? '.');
  const out = { config: root, directories: new Set(), patterns: [] };
  if (root == null) return out;
  const queue = [root];
  const seen = new Set();
  while (queue.length > 0) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const config = readTsconfig(repo, path);
    if (config == null) continue;
    const exclude = (config.exclude?.list ?? []).map((item) => join(config.exclude.dir, item)).filter((item) => item != null);
    if (config.files) {
      for (const file of config.files.list) {
        const target = join(config.files.dir, file);
        if (target != null) out.patterns.push({ globs: [target], exclude: [] });
      }
    }
    if (config.include) {
      for (const entry of config.include.list) {
        const target = join(config.include.dir, entry.replace(/\/\*\*(\/\*)?$/, ''));
        if (target == null) continue;
        const last = target.slice(target.lastIndexOf('/') + 1);
        if (!/[*?]/.test(last) && !last.includes('.')) {
          for (const found of repo.directoriesMatching(target)) out.directories.add(found);
        } else {
          const globs = /\*$/.test(target) ? TS_EXTENSIONS.map((ext) => `${target.replace(/\.\*$|\*$/, '*')}${ext}`) : [target];
          out.patterns.push({ globs: [...new Set(globs)], exclude });
        }
      }
    } else if (!config.files) {
      if (config.dir === '') out.patterns.push({ globs: TS_EXTENSIONS.map((ext) => `**/*${ext}`), exclude });
      else out.directories.add(config.dir);
    }
    if (build) {
      for (const ref of config.references) {
        const target = projectFile(repo, config.dir, ref);
        if (target != null) queue.push(target);
      }
    }
  }
  return out;
}

/* ---------- vitest ---------- */

export function vitestTargets(repo, cwd, { config, root }) {
  const path = config != null ? join(cwd, config) : firstTracked(repo, root != null ? join(cwd, root) : cwd, VITEST_CONFIGS);
  const found = path != null && repo.tracked.has(path) ? path : null;
  let base = root != null ? join(cwd, root) : cwd;
  let include = VITEST_INCLUDE;
  let exclude = VITEST_EXCLUDE;
  if (found) {
    const src = withoutComments(repo.text(found) ?? '');
    const test = [...src.matchAll(/(?:^|[\s{,(])test\s*:/g)]
      .map((match) => objectAt(src, match.index + match[0].length))
      .find((open) => open !== -1);
    if (test != null) {
      const keys = ownKeys(src, test);
      const read = (key) => (keys.has(key) ? stringsAt(src, keys.get(key)) : null);
      const includes = read('include');
      if (includes && includes.values.length > 0) include = includes.values;
      const excludes = read('exclude');
      if (excludes) exclude = excludes.complete ? excludes.values : [...VITEST_EXCLUDE, ...excludes.values];
      const dir = read('dir');
      if (dir?.values.length === 1 && root == null) base = join(cwd, dir.values[0]) ?? base;
      // projects (and the older workspace) hands the run to each project's
      // own config: a directory, a glob of them, or a config file.
      const projects = read('projects') ?? read('workspace');
      if (projects && projects.values.length > 0) {
        const from = posix.dirname(found) === '.' ? '' : posix.dirname(found);
        return { config: found, base, include, exclude, projects: vitestProjects(repo, from, projects.values) };
      }
    }
  }
  return { config: found, base, include, exclude };
}

// The directories (with a config file, when one is named) the projects of a
// vitest config stand for, relative to the config's own directory.
function vitestProjects(repo, from, entries) {
  const out = [];
  for (const entry of entries) {
    if (entry.startsWith('!')) continue;
    const target = join(from, entry.replace(/\/$/, ''));
    if (target == null) continue;
    if (repo.tracked.has(target)) out.push({ dir: posix.dirname(target) === '.' ? '' : posix.dirname(target), config: posix.basename(target) });
    else for (const dir of repo.directoriesMatching(target)) out.push({ dir, config: null });
  }
  return out;
}

/* ---------- jest ---------- */

export function jestTargets(repo, cwd, { config }) {
  let found = config != null ? join(cwd, config) : firstTracked(repo, cwd, JEST_CONFIGS);
  if (found != null && !repo.tracked.has(found)) found = null;
  let match = null;
  let ignore = [];
  let roots = null;
  if (found?.endsWith('.json')) {
    const json = parseJsonc(repo.text(found));
    match = stringList(json?.testMatch);
    ignore = stringList(json?.testPathIgnorePatterns) ?? [];
    roots = stringList(json?.roots);
  } else if (found) {
    const src = withoutComments(repo.text(found) ?? '');
    const listed = everyStrings(src, 'testMatch');
    if (listed.length > 0) match = listed;
    ignore = everyStrings(src, 'testPathIgnorePatterns');
    const rooted = everyStrings(src, 'roots');
    if (rooted.length > 0) roots = rooted;
  } else {
    const pkg = repo.manifest(cwd);
    if (pkg && typeof pkg.jest === 'object' && pkg.jest != null) {
      found = cwd ? `${cwd}/package.json` : 'package.json';
      match = stringList(pkg.jest.testMatch);
      ignore = stringList(pkg.jest.testPathIgnorePatterns) ?? [];
      roots = stringList(pkg.jest.roots);
    }
  }
  const bases = (roots ?? ['<rootDir>'])
    .map((item) => join(cwd, item.replace(/^<rootDir>\/?/, '') || '.'))
    .filter((item) => item != null);
  return { config: found, bases, include: match ?? JEST_MATCH, ignore };
}

/* ---------- mocha ---------- */

export function mochaTargets(repo, cwd, { config }) {
  let found = config != null ? join(cwd, config) : firstTracked(repo, cwd, MOCHA_CONFIGS);
  if (found != null && !repo.tracked.has(found)) found = null;
  let options = null;
  if (found) {
    const text = repo.text(found) ?? '';
    if (/\.ya?ml$/.test(found)) {
      try {
        options = parseYaml(text);
      } catch {
        options = null;
      }
    } else if (/\.jsonc?$/.test(found)) options = parseJsonc(text);
    else {
      const src = withoutComments(text);
      options = { spec: everyStrings(src, 'spec'), recursive: /(?:^|[\s{,])recursive\s*:\s*true/.test(src) };
    }
  } else {
    const pkg = repo.manifest(cwd);
    if (pkg && typeof pkg.mocha === 'object' && pkg.mocha != null) {
      found = cwd ? `${cwd}/package.json` : 'package.json';
      options = pkg.mocha;
    }
  }
  const spec = stringList(options?.spec);
  return {
    config: found,
    spec: spec && spec.length > 0 ? spec : ['./test'],
    recursive: options?.recursive === true,
    extensions: stringList(options?.extension) ?? ['js', 'cjs', 'mjs'],
  };
}

/* ---------- eslint ---------- */

export function eslintTargets(repo, cwd, { config }) {
  let found = config != null ? join(cwd, config) : firstTracked(repo, cwd, ESLINT_CONFIGS);
  if (found != null && !repo.tracked.has(found)) found = null;
  const ignores = [];
  if (found) ignores.push(...everyStrings(withoutComments(repo.text(found) ?? ''), 'ignores'));
  const legacy = join(cwd, '.eslintignore');
  if (legacy != null && repo.tracked.has(legacy)) {
    for (const line of (repo.text(legacy) ?? '').split(/\r?\n/)) {
      const pattern = line.trim();
      if (pattern !== '' && !pattern.startsWith('#') && !pattern.startsWith('!')) ignores.push(pattern);
    }
  }
  return { config: found, ignores };
}

/* ---------- pytest ---------- */

/**
 * The testpaths a pytest configuration names, relative to the directory of
 * the file that names them. pytest reads the first of these files that
 * configures it; pytest.ini configures it even when empty.
 */
export function pytestTargets(repo, cwd, { config }) {
  const candidates = config != null ? [config] : PYTEST_CONFIGS;
  for (const name of candidates) {
    const path = join(cwd, name);
    if (path == null || !repo.tracked.has(path)) continue;
    const text = repo.text(path) ?? '';
    const section = pytestSection(name, text);
    if (section == null) continue;
    const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);
    const paths = (section.testpaths ?? []).map((item) => join(dir, item)).filter((item) => item != null);
    return { config: path, testpaths: paths };
  }
  return { config: null, testpaths: [] };
}

function pytestSection(name, text) {
  const base = posix.basename(name);
  if (base === 'pyproject.toml') {
    const body = tomlSection(text, 'tool.pytest.ini_options');
    if (body == null) return null;
    const match = /^\s*testpaths\s*=\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/m.exec(body);
    if (!match) return { testpaths: [] };
    const values = [...match[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
    return { testpaths: values };
  }
  const header = base === 'setup.cfg' ? 'tool:pytest' : 'pytest';
  const body = iniSection(text, header);
  if (body == null) return base === 'pytest.ini' || base === '.pytest.ini' ? { testpaths: [] } : null;
  const match = /^testpaths\s*=\s*(.*(?:\n[ \t]+.*)*)/m.exec(body);
  return { testpaths: match ? match[1].split(/\s+/).filter(Boolean) : [] };
}

function tomlSection(text, name) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${name}]`);
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
}

function iniSection(text, name) {
  return tomlSection(text, name);
}

/* ---------- make ---------- */

/**
 * The recipe lines `make <targets>` runs, with the prerequisites they depend
 * on, and the variables the makefile sets spelled out. With no target, make
 * runs the first one the file defines.
 */
export function makeRecipes(text, targets) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    if (lines.length > 0 && lines[lines.length - 1].endsWith('\\')) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)} ${raw.trim()}`;
    else lines.push(raw);
  }
  const variables = new Map([['MAKE', 'make']]);
  const rules = new Map();
  let first = null;
  let current = null;
  for (const line of lines) {
    if (line.startsWith('\t')) {
      if (current) for (const target of current) rules.get(target).recipe.push(line.slice(1));
      continue;
    }
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const assignment = /^\s*(?:export\s+|override\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*(\?=|:::=|::=|:=|\+=|=)\s*(.*)$/.exec(line);
    if (assignment) {
      const [, name, op, value] = assignment;
      if (op === '?=' && variables.has(name)) continue;
      variables.set(name, op === '+=' && variables.has(name) ? `${variables.get(name)} ${value.trim()}` : value.trim());
      current = null;
      continue;
    }
    const rule = /^([^:#=\t][^:#=]*?)\s*::?(?!=)\s*([^;#]*)(?:;\s*(.*))?$/.exec(line);
    if (!rule) {
      current = null;
      continue;
    }
    const names = rule[1].split(/\s+/).filter(Boolean);
    const prerequisites = rule[2].split('|')[0].split(/\s+/).filter(Boolean);
    for (const name of names) {
      if (!rules.has(name)) rules.set(name, { prerequisites: [], recipe: [] });
      rules.get(name).prerequisites.push(...prerequisites);
      if (rule[3]) rules.get(name).recipe.push(rule[3]);
      if (first == null && !name.startsWith('.') && !name.includes('%')) first = name;
    }
    current = names;
  }
  const goal = variables.get('.DEFAULT_GOAL') ?? first;
  const wanted = targets.length > 0 ? targets : goal ? [goal] : [];
  const recipe = [];
  const seen = new Set();
  const visit = (name, depth) => {
    if (seen.has(name) || depth > 16) return;
    seen.add(name);
    const found = rules.get(name);
    if (!found) return;
    for (const prerequisite of found.prerequisites) visit(expand(prerequisite, variables, name), depth + 1);
    for (const line of found.recipe) recipe.push(expand(line.replace(/^[@+-]+/, ''), variables, name));
  };
  for (const name of wanted) visit(name, 0);
  return recipe.join('\n');
}

function expand(text, variables, target, depth = 0) {
  if (depth > 8) return text;
  return text
    .replace(/\$\$/g, '\0')
    .replace(/\$@/g, target)
    .replace(/\$[({]([A-Za-z_][A-Za-z0-9_.-]*)[)}]/g, (whole, name) => (variables.has(name) ? expand(variables.get(name), variables, target, depth + 1) : whole))
    .replace(/\0/g, '$');
}

/* ---------- helpers ---------- */

function stringList(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  return null;
}
