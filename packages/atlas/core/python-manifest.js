import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storedText } from './text.js';

/**
 * What a Python project declares about itself: the distributions it depends
 * on and the console scripts it installs. Read from pyproject.toml and
 * requirements files with a line reader, not a TOML library, because only a
 * handful of tables are wanted and the core takes no dependency for them.
 */

const REQUIREMENTS = /(^|\/)requirements[^/]*\.txt$/i;
const REQUIREMENT_NAME = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;

// A distribution is imported under its name with dashes and dots folded to
// underscores, lowercased: python-dateutil is python_dateutil. A distribution
// whose import name differs outright (PyJWT is jwt) is not matched, which
// leaves such an import to the ordinary lookup.
export function importName(distribution) {
  return String(distribution).trim().toLowerCase().replace(/[-.]+/g, '_');
}

// Distributions imported under a name their own does not fold to.
const IMPORT_ALIASES = {
  attrs: 'attr', beautifulsoup4: 'bs4', 'faiss_cpu': 'faiss', 'opencv_python': 'cv2', 'opencv_python_headless': 'cv2',
  pillow: 'PIL', protobuf: 'google', pyjwt: 'jwt', pymupdf: 'fitz', pyyaml: 'yaml', 'scikit_learn': 'sklearn',
};

/**
 * Every name a distribution may be imported under: its folded name, a
 * known alias (PyYAML is yaml, Pillow is PIL), and the name without the
 * python- prefix or the -py suffix its packagers add (python-docx is docx,
 * xrpl-py is xrpl).
 */
export function importNames(distribution) {
  const folded = importName(distribution);
  const names = new Set([folded]);
  if (IMPORT_ALIASES[folded]) names.add(IMPORT_ALIASES[folded].toLowerCase());
  if (folded.startsWith('python_') && folded.length > 7) names.add(folded.slice(7));
  if (folded.startsWith('py_') && folded.length > 3) names.add(folded.slice(3));
  if (folded.endsWith('_py') && folded.length > 3) names.add(folded.slice(0, -3));
  if (folded.endsWith('_python') && folded.length > 7) names.add(folded.slice(0, -7));
  return [...names];
}

/**
 * The import names every tracked pyproject.toml and requirements file
 * declares as dependencies, without the projects' own names: an extra that
 * pulls in the project itself ("backpropagate[ui]") names no dependency.
 *
 * @param {string} repoPath
 * @param {Iterable<string>} tracked
 * @returns {Set<string>}
 */
export function declaredDependencies(repoPath, tracked) {
  const names = new Set();
  const own = new Set();
  for (const path of tracked) {
    if (path === 'pyproject.toml' || path.endsWith('/pyproject.toml')) {
      const tables = readToml(repoPath, path);
      for (const name of projectNames(tables)) own.add(name);
      for (const spec of dependencySpecs(tables)) {
        const match = REQUIREMENT_NAME.exec(spec);
        if (match) for (const name of importNames(match[1])) names.add(name);
      }
    } else if (REQUIREMENTS.test(path)) {
      for (const line of readText(repoPath, path).split(/\r?\n/)) {
        const text = line.replace(/\s#.*$/, '').trim();
        if (text === '' || text.startsWith('#') || text.startsWith('-')) continue;
        const match = REQUIREMENT_NAME.exec(text);
        if (match) for (const name of importNames(match[1])) names.add(name);
      }
    }
  }
  names.delete('python');
  for (const name of own) names.delete(name);
  return names;
}

/**
 * The console and GUI scripts every tracked pyproject.toml installs, as the
 * command a person types, the module it runs and the function it calls:
 * `backprop = "backpropagate.cli:main"` is { name: 'backprop', module:
 * 'backpropagate.cli', fn: 'main' }.
 *
 * @param {string} repoPath
 * @param {Iterable<string>} tracked
 * @returns {Array<{ manifest: string, name: string, module: string, fn: string | null }>}
 */
export function declaredScripts(repoPath, tracked) {
  const out = [];
  for (const path of tracked) {
    if (path !== 'pyproject.toml' && !path.endsWith('/pyproject.toml')) continue;
    const tables = readToml(repoPath, path);
    const root = rootPackageDir(tables);
    for (const table of ['project.scripts', 'project.gui-scripts', 'tool.poetry.scripts']) {
      for (const [name, value] of Object.entries(tables.get(table) ?? {})) {
        const [target] = strings(value);
        if (!target) continue;
        const [module, fn] = target.split(':').map((part) => part.trim());
        if (!/^[A-Za-z_][\w.]*$/.test(module)) continue;
        const script = { manifest: path, name, module, fn: fn && /^[A-Za-z_]\w*$/.test(fn) ? fn : null };
        if (root) script.packageDir = root;
        out.push(script);
      }
    }
  }
  return out;
}

// [tool.setuptools] package-dir = { "" = "tools" }: the directory, beside the
// manifest, that top-level modules are installed from.
function rootPackageDir(tables) {
  const text = tables.get('tool.setuptools')?.['package-dir'];
  const match = typeof text === 'string' ? /(["'])\1\s*=\s*["']([^"']+)["']/.exec(text) : null;
  const dir = match ? match[2].replace(/^\.\/|\/+$/g, '') : '';
  return dir && !dir.startsWith('/') && !dir.split('/').includes('..') ? dir : null;
}

/**
 * The directories, relative to a pyproject.toml's own, that setuptools
 * installs top-level modules from: package-dir's "" entry, and each where
 * of packages.find. They are source roots, as src/ is.
 *
 * @param {string} text the pyproject.toml
 * @returns {string[]}
 */
export function setuptoolsRoots(text) {
  const tables = parseToml(text);
  const out = [];
  const add = (dir) => {
    const clean = String(dir).replace(/^\.\//, '').replace(/\/+$/, '');
    if (clean && clean !== '.' && !clean.startsWith('/') && !clean.split('/').includes('..') && !out.includes(clean)) out.push(clean);
  };
  const root = rootPackageDir(tables);
  if (root) add(root);
  for (const dir of strings(tables.get('tool.setuptools.packages.find')?.where ?? '')) add(dir);
  return out;
}

function projectNames(tables) {
  const names = [];
  for (const table of ['project', 'tool.poetry']) {
    const [name] = strings(tables.get(table)?.name ?? '');
    if (name) names.push(importName(name));
  }
  return names;
}

function dependencySpecs(tables) {
  const specs = [...strings(tables.get('project')?.dependencies ?? '')];
  for (const value of Object.values(tables.get('project.optional-dependencies') ?? {})) specs.push(...strings(value));
  for (const table of ['tool.poetry.dependencies', 'tool.poetry.dev-dependencies']) {
    specs.push(...Object.keys(tables.get(table) ?? {}));
  }
  for (const [name, keys] of tables) {
    if (/^tool\.poetry\.group\.[^.]+\.dependencies$/.test(name)) specs.push(...Object.keys(keys));
  }
  return specs;
}

function readText(repoPath, path) {
  try {
    return storedText(readFileSync(join(repoPath, path), 'utf8'));
  } catch {
    return '';
  }
}

/**
 * Each table's keys with their raw value text. A value that opens an array
 * runs until its brackets close, across lines; comments outside strings are
 * dropped. Inline tables and dotted keys are kept as raw text, which is all
 * the callers read.
 */
function readToml(repoPath, path) {
  return parseToml(readText(repoPath, path));
}

/**
 * The directories, relative to the pyproject.toml's own, that a wheel built
 * from it packs: hatch's wheel target packages, setuptools' packages or the
 * directories its package finder searches, poetry's packages, flit's module,
 * and with none of those the project's name as a directory at the root or
 * under src/, which is where every backend looks by default.
 *
 * @param {string} text the pyproject.toml
 * @param {(dir: string) => boolean} isDir whether a directory, relative to the manifest's, is tracked
 * @returns {string[]}
 */
export function wheelPackages(text, isDir) {
  const tables = parseToml(text);
  const dirs = [];
  const add = (dir) => {
    const clean = String(dir).replace(/^\.\//, '').replace(/\/+$/, '');
    if (clean && !clean.startsWith('/') && !clean.split('/').includes('..') && isDir(clean) && !dirs.includes(clean)) dirs.push(clean);
  };
  for (const dir of strings(tables.get('tool.hatch.build.targets.wheel')?.packages ?? '')) add(dir);
  const setuptools = tables.get('tool.setuptools') ?? {};
  const root = rootPackageDir(tables);
  for (const name of strings(setuptools.packages ?? '')) add(`${root ? `${root}/` : ''}${name.replaceAll('.', '/')}`);
  for (const dir of strings(tables.get('tool.setuptools.packages.find')?.where ?? '')) add(dir);
  for (const entry of String(tables.get('tool.poetry')?.packages ?? '').matchAll(/\{([^}]*)\}/g)) {
    const include = /include\s*=\s*["']([^"']+)["']/.exec(entry[1])?.[1];
    const from = /from\s*=\s*["']([^"']+)["']/.exec(entry[1])?.[1];
    if (include) add(from ? `${from}/${include}` : include);
  }
  const [flit] = strings(tables.get('tool.flit.module')?.name ?? '');
  if (flit) add(flit.replaceAll('.', '/'));
  if (dirs.length === 0) {
    const [name] = strings(tables.get('project')?.name ?? tables.get('tool.poetry')?.name ?? '');
    if (name) for (const dir of [importName(name), `src/${importName(name)}`]) add(dir);
  }
  return dirs;
}

function parseToml(text) {
  const tables = new Map();
  let current = '';
  tables.set(current, {});
  let pending = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = stripComment(raw);
    if (pending) {
      pending.text += `\n${line}`;
      if (balanced(pending.text)) {
        tables.get(current)[pending.key] = pending.text;
        pending = null;
      }
      continue;
    }
    const header = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*$/.exec(line);
    if (header) {
      current = header[1].split('.').map((part) => part.trim().replace(/^["']|["']$/g, '')).join('.');
      if (!tables.has(current)) tables.set(current, {});
      continue;
    }
    const pair = /^\s*("[^"]*"|'[^']*'|[A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].replace(/^["']|["']$/g, '');
    const value = pair[2];
    if (balanced(value)) tables.get(current)[key] = value;
    else pending = { key, text: value };
  }
  return tables;
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === '\\' && quote === '"') i += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '#') return line.slice(0, i);
  }
  return line;
}

function balanced(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === '\\' && quote === '"') i += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') depth -= 1;
  }
  return depth <= 0;
}

function strings(text) {
  const out = [];
  for (const match of String(text).matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)) out.push(match[1] ?? match[2]);
  return out;
}
