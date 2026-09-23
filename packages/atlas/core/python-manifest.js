import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
        if (match) names.add(importName(match[1]));
      }
    } else if (REQUIREMENTS.test(path)) {
      for (const line of readText(repoPath, path).split(/\r?\n/)) {
        const text = line.replace(/\s#.*$/, '').trim();
        if (text === '' || text.startsWith('#') || text.startsWith('-')) continue;
        const match = REQUIREMENT_NAME.exec(text);
        if (match) names.add(importName(match[1]));
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
    for (const table of ['project.scripts', 'project.gui-scripts', 'tool.poetry.scripts']) {
      for (const [name, value] of Object.entries(tables.get(table) ?? {})) {
        const [target] = strings(value);
        if (!target) continue;
        const [module, fn] = target.split(':').map((part) => part.trim());
        if (!/^[A-Za-z_][\w.]*$/.test(module)) continue;
        out.push({ manifest: path, name, module, fn: fn && /^[A-Za-z_]\w*$/.test(fn) ? fn : null });
      }
    }
  }
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
    return readFileSync(join(repoPath, path), 'utf8');
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
  const tables = new Map();
  let current = '';
  tables.set(current, {});
  let pending = null;
  for (const raw of readText(repoPath, path).split(/\r?\n/)) {
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
