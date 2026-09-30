import { posix } from 'node:path';
import semver from 'semver';

/**
 * The runtime of a workflow job, as its workflow declares it
 * (docs/atlas-production.spec.md, Part 2): the runner labels it asks for and
 * the platform they mean, the deployment environment it names, and the
 * versions its setup-node and setup-python steps pin, with the range each can
 * resolve to offline. Nothing is looked up: a value only a run can know (an
 * expression, lts/*, a self-hosted runner, a container) is recorded as
 * unresolved, with why. A secret's value and a step's script are never read.
 */

// The platform each GitHub-hosted runner label means, from the GitHub-hosted
// runners reference (https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
// ubuntu-* is Linux on x64 with glibc and ubuntu-*-arm on arm64; windows-* is
// x64 and windows-*-arm arm64; macos-* is Apple silicon, except the Intel
// images: macos-*-intel, the -large sizes, and macos-13 and older.
const LABELS = [
  [/^ubuntu-[\w.]+-arm$/, { os: 'linux', cpu: 'arm64', libc: 'glibc' }],
  [/^ubuntu-[\w.]+$/, { os: 'linux', cpu: 'x64', libc: 'glibc' }],
  [/^windows-[\w.]+-arm$/, { os: 'win32', cpu: 'arm64' }],
  [/^windows-[\w.]+$/, { os: 'win32', cpu: 'x64' }],
  [/^macos-[\w.]+-(?:intel|large)$/, { os: 'darwin', cpu: 'x64' }],
  [/^macos-(?:1[0-3])$/, { os: 'darwin', cpu: 'x64' }],
  [/^macos-[\w.]+$/, { os: 'darwin', cpu: 'arm64' }],
];

// The Node.js release lines by codename, from the Node.js release working
// group's list of codenames (https://github.com/nodejs/Release/blob/main/CODENAMES.md).
// lts/<codename> is the newest release of that line.
const LTS = {
  argon: 4, boron: 6, carbon: 8, dubnium: 10, erbium: 12, fermium: 14, gallium: 16, hydrogen: 18, iron: 20, jod: 22, krypton: 24,
};

// The forms setup-node resolves only at run time, against the list of
// releases it downloads (actions/setup-node, "Supported version syntax").
const NODE_ONLINE = new Set(['lts/*', 'lts', 'latest', 'node', 'current', '*', 'stable']);

const SETUP = [
  { action: 'actions/setup-node', tool: 'node', version: 'node-version', file: 'node-version-file' },
  { action: 'actions/setup-python', tool: 'python', version: 'python-version', file: 'python-version-file' },
];

/**
 * The platform a GitHub-hosted label means, or null for any other label.
 *
 * @param {string} label
 * @returns {{ os: string, cpu: string, libc?: string } | null}
 */
export function platformOf(label) {
  const hit = LABELS.find(([pattern]) => pattern.test(label));
  return hit ? { ...hit[1] } : null;
}

/**
 * The runtime one job declares.
 *
 * @param {{ name: string, body: object, steps: object[], repo: object, selfPath: string|null,
 *   source: (step: object|null, path: Array<string|number>) => string|null }} input
 *   source gives the text a scalar of a step (or, with no step, of the job)
 *   was written as, where the parsed value would lose it (22.10 is the number
 *   22.1), or null
 */
export function jobRuntime({ name, body, steps, repo, selfPath, source }) {
  const out = { basis: 'declared', name, runsOn: runsOnOf(body) };
  const environment = environmentOf(body.environment);
  if (environment) out.environment = environment;
  const setup = [];
  steps.forEach((step, index) => {
    if (!isMapping(step) || typeof step.uses !== 'string') return;
    const action = step.uses.replace(/@.*$/, '');
    const kind = SETUP.find((entry) => entry.action === action);
    if (!kind) return;
    const stepName = typeof step.name === 'string' && step.name.trim() !== '' ? step.name : String(index);
    const given = isMapping(step.with) ? step.with : {};
    setup.push({ ...setupOf(kind, given, { body, repo, selfPath, source, written: (key) => source(step, ['with', key]) }), step: stepName, index });
  });
  if (setup.length > 0) out.setup = setup;
  return out;
}

// One leg per runner a literal matrix names, or the one runs-on spells.
function runsOnOf(body) {
  const runsOn = body['runs-on'];
  const container = body.container != null;
  const leg = (labels) => {
    const why = container ? 'container' : legUnresolved(labels);
    if (why) return { labels, unresolved: why };
    return { labels, platform: platformOf(labels[0]) };
  };
  if (typeof body.uses === 'string') return [{ labels: [], unresolved: 'called workflow' }];
  if (typeof runsOn === 'string') {
    const axis = /^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$/.exec(runsOn.trim());
    if (axis) {
      const values = matrixValues(body, axis[1]);
      if (values != null && values.length > 0) return values.map((value) => leg(Array.isArray(value) ? value : [value]));
    }
    return [leg([runsOn])];
  }
  if (Array.isArray(runsOn)) return [leg(runsOn.map(String))];
  if (isMapping(runsOn)) return [{ labels: Array.isArray(runsOn.labels) ? runsOn.labels.map(String) : typeof runsOn.labels === 'string' ? [runsOn.labels] : [], unresolved: 'runner group' }];
  return [{ labels: [], unresolved: 'no runs-on' }];
}

function legUnresolved(labels) {
  if (labels.length === 0) return 'no runs-on';
  if (labels.some((label) => label.includes('${{'))) return 'expression';
  if (labels.some((label) => label === 'self-hosted')) return 'self-hosted';
  // A runner is chosen by every label it carries; more than one label is a
  // self-hosted pool's, and a label outside the table is one too.
  if (labels.length > 1 || platformOf(labels[0]) == null) return 'self-hosted';
  return null;
}

// The values a literal matrix gives an axis, from its list and its include
// entries, each a label or a list of labels; null when the matrix is spelled
// with an expression.
function matrixValues(body, axis) {
  const strategy = isMapping(body.strategy) ? body.strategy : null;
  const matrix = strategy && isMapping(strategy.matrix) ? strategy.matrix : null;
  if (!matrix) return null;
  const values = [];
  const add = (value) => {
    if (typeof value === 'string' && !value.includes('${{')) values.push(value);
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string' && !item.includes('${{'))) values.push(value.map(String));
    else return false;
    return true;
  };
  if (matrix[axis] !== undefined) {
    if (!Array.isArray(matrix[axis])) return null;
    for (const value of matrix[axis]) if (!add(value)) return null;
  }
  for (const entry of Array.isArray(matrix.include) ? matrix.include : []) {
    if (isMapping(entry) && entry[axis] !== undefined && !add(entry[axis])) return null;
  }
  const seen = new Set();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function environmentOf(value) {
  if (value == null) return null;
  const name = isMapping(value) ? value.name : value;
  if (typeof name !== 'string' || name.trim() === '') return { unresolved: 'no name' };
  if (name.includes('${{')) return { unresolved: 'expression' };
  return { name };
}

/**
 * A setup step's pin: the version as written, the version file it names and
 * what that tracked file says, and the ranges it can resolve to offline, one
 * per value of a literal matrix; or unresolved, with why. The version wins
 * over the file, as setup-node and setup-python read them.
 */
function setupOf(kind, given, { body, repo, selfPath, source, written }) {
  const out = { uses: kind.action };
  const rawVersion = given[kind.version];
  const rawFile = given[kind.file];
  const version = rawVersion == null ? null : typeof rawVersion === 'number' ? (written(kind.version) ?? String(rawVersion)) : String(rawVersion);
  if (version != null && version.trim() !== '') out.version = version.trim();
  if (typeof rawFile === 'string' && rawFile.trim() !== '') out.versionFile = rawFile.trim();
  const range = (value) => (kind.tool === 'node' ? nodeRange(value) : pythonRange(value));
  if (out.version != null) {
    if (out.version.includes('\n')) return { ...out, unresolved: 'several versions' };
    const axis = /^\$\{\{\s*matrix\.([\w-]+)\s*\}\}$/.exec(out.version);
    if (axis) {
      const values = matrixValues(body, axis[1]) ?? scalarMatrix(body, axis[1], source);
      if (values == null || values.length === 0) return { ...out, unresolved: 'expression' };
      return withRanges(out, values.map(String), range);
    }
    if (out.version.includes('${{')) return { ...out, unresolved: 'expression' };
    return withRanges(out, [out.version], range);
  }
  if (out.versionFile != null) {
    if (out.versionFile.includes('${{')) return { ...out, unresolved: 'expression' };
    const path = ownPath(out.versionFile, selfPath);
    if (path == null || !repo.tracked.has(path)) return { ...out, unresolved: 'file not tracked' };
    const says = kind.tool === 'node' ? nodeFileSays(repo, path) : pythonFileSays(repo, path);
    if (says == null) return { ...out, unresolved: 'file names no version' };
    out.fileSays = says.value;
    if (says.range !== undefined) return says.range == null ? { ...out, unresolved: says.value } : { ...out, ranges: [{ from: says.value, range: says.range }] };
    return withRanges(out, [says.value], range);
  }
  return { ...out, unresolved: 'no version' };
}

function withRanges(out, values, range) {
  const ranges = [];
  for (const value of values) {
    const found = range(value);
    if (found == null) return { ...out, unresolved: value };
    ranges.push({ from: value, range: found });
  }
  return { ...out, ranges };
}

// A matrix axis holding numbers (node: [20, 22.10]) is the versions as
// written, each number by the text it was written as.
function scalarMatrix(body, axis, source) {
  const matrix = isMapping(body.strategy) && isMapping(body.strategy.matrix) ? body.strategy.matrix : null;
  if (!matrix || (matrix[axis] !== undefined && !Array.isArray(matrix[axis]))) return null;
  const values = [];
  const add = (value, path) => {
    if (typeof value === 'number') values.push(source(null, ['strategy', 'matrix', ...path]) ?? String(value));
    else if (typeof value === 'string' && !value.includes('${{')) values.push(value);
    else return false;
    return true;
  };
  for (const [index, value] of (matrix[axis] ?? []).entries()) if (!add(value, [axis, index])) return null;
  for (const [index, entry] of (Array.isArray(matrix.include) ? matrix.include : []).entries()) {
    if (isMapping(entry) && entry[axis] !== undefined && !add(entry[axis], ['include', index, axis])) return null;
  }
  return [...new Set(values)];
}

// A version file is read from the workspace root; in a job that checks this
// repository out into a directory, only a path through it is this repository's.
function ownPath(raw, selfPath) {
  const clean = posix.normalize(raw.replace(/^\.\//, '')).replace(/\/+$/, '');
  if (clean.startsWith('..') || clean.startsWith('/') || clean.includes('$')) return null;
  if (selfPath == null) return clean;
  return clean.startsWith(`${selfPath}/`) ? clean.slice(selfPath.length + 1) : null;
}

/**
 * The range of Node versions a setup-node version can resolve to, read as
 * setup-node reads it, or null when only a run can know it: 20 is any 20.x,
 * lts/iron is 20.x, lts/* and latest are unresolved.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function nodeRange(value) {
  const text = String(value).trim().replace(/^v(?=\d)/, '');
  if (text === '' || NODE_ONLINE.has(text.toLowerCase())) return null;
  const lts = /^lts\/([a-z]+)$/i.exec(text);
  if (lts) {
    const major = LTS[lts[1].toLowerCase()];
    return major == null ? null : semver.validRange(`${major}.x`);
  }
  if (/[a-z]/i.test(text.replace(/\b[xX]\b/g, ''))) return null;
  return semver.validRange(text);
}

/**
 * The range of Python versions a setup-python version can resolve to, or
 * null: 3.12 is any 3.12.x; PyPy, GraalPy and free-threaded builds are
 * unresolved.
 */
export function pythonRange(value) {
  const text = String(value).trim();
  if (text === '' || /[a-z]/i.test(text.replace(/\b[xX]\b/g, ''))) return null;
  return semver.validRange(text);
}

/**
 * A PEP 440 version specifier (requires-python) as a semver range, or null
 * when it holds a clause semver cannot say: >=3.10 is >=3.10.0, ~=3.11 is
 * >=3.11.0 <4.0.0, ==3.11.* is 3.11.x. An exclusion (!=) is left out, which
 * only widens the range.
 */
export function pep440Range(spec) {
  const clauses = String(spec).split(',').map((clause) => clause.trim()).filter(Boolean);
  if (clauses.length === 0) return null;
  const parts = [];
  for (const clause of clauses) {
    const match = /^(~=|===|==|!=|<=|>=|<|>)\s*([0-9][0-9.]*(?:\.\*)?)$/.exec(clause);
    if (!match) return null;
    const [, op, raw] = match;
    if (op === '!=') continue;
    if (op === '===') return null;
    const wild = raw.endsWith('.*');
    const numbers = raw.replace(/\.\*$/, '').split('.').filter(Boolean).map(Number);
    if (numbers.length === 0 || numbers.some((n) => !Number.isInteger(n))) return null;
    const full = [...numbers, 0, 0].slice(0, 3).join('.');
    if (op === '==') parts.push(wild ? `${numbers.join('.')}.x` : `=${full}`);
    else if (op === '~=') {
      if (numbers.length < 2) return null;
      const upper = [...numbers.slice(0, -2), numbers[numbers.length - 2] + 1];
      parts.push(`>=${full} <${[...upper, 0, 0].slice(0, 3).join('.')}`);
    } else {
      if (wild) return null;
      parts.push(`${op}${full}`);
    }
  }
  if (parts.length === 0) return null;
  return semver.validRange(parts.join(' '));
}

// What a Node version file says: .nvmrc and .node-version hold the version
// on their first line; .tool-versions on its nodejs line; package.json in
// volta.node, then devEngines.runtime, then engines.node, the order
// setup-node reads them in.
function nodeFileSays(repo, path) {
  const text = repo.text(path);
  if (text == null) return null;
  const base = posix.basename(path);
  if (base === 'package.json') {
    let pkg = null;
    try {
      pkg = JSON.parse(text);
    } catch {
      return null;
    }
    if (!isMapping(pkg)) return null;
    if (isMapping(pkg.volta) && typeof pkg.volta.node === 'string') return { value: pkg.volta.node.trim() };
    const runtimes = isMapping(pkg.devEngines) ? [pkg.devEngines.runtime].flat() : [];
    const node = runtimes.find((entry) => isMapping(entry) && entry.name === 'node' && typeof entry.version === 'string');
    if (node) return { value: node.version.trim() };
    if (isMapping(pkg.engines) && typeof pkg.engines.node === 'string') return { value: pkg.engines.node.trim() };
    return null;
  }
  if (base === '.tool-versions') return toolVersion(text, ['nodejs', 'node']);
  return firstLine(text);
}

// What a Python version file says: .python-version on its first line,
// .tool-versions on its python line, pyproject.toml in requires-python,
// read as a PEP 440 specifier.
function pythonFileSays(repo, path) {
  const text = repo.text(path);
  if (text == null) return null;
  const base = posix.basename(path);
  if (base === 'pyproject.toml') {
    const found = /^\s*requires-python\s*=\s*(["'])([^"'\n]*)\1/m.exec(text);
    if (!found) return null;
    return { value: found[2].trim(), range: pep440Range(found[2]) };
  }
  if (base === '.tool-versions') return toolVersion(text, ['python']);
  return firstLine(text);
}

function toolVersion(text, names) {
  for (const line of text.split('\n')) {
    const words = line.replace(/#.*$/, '').trim().split(/\s+/);
    if (names.includes(words[0]) && words[1]) return { value: words[1] };
  }
  return null;
}

function firstLine(text) {
  const line = text.split('\n').map((entry) => entry.replace(/#.*$/, '').trim()).find((entry) => entry !== '');
  return line ? { value: line } : null;
}

function isMapping(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
