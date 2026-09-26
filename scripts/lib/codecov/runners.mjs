import { posix } from 'node:path';
import { parse as parseScript } from '@babel/parser';
import { parseToml } from '../../../packages/atlas/core/toml.js';
import { C8 } from './recipe.mjs';
import { simpleCommands } from './shell.mjs';

/**
 * What a test step needs to write coverage Codecov reads and JUnit test
 * results: flags added to the one command that runs the runner, variables
 * added to the step, and steps run after it; and where each report lands,
 * from the repository's root. When the step's shape leaves the edit
 * uncertain, the reason instead, for a person to finish by hand. The step's
 * `if:` is never touched: the edit changes what a run writes, not when it
 * runs.
 *
 * @param {object} input
 * @param {string} input.runner Atlas's runner for the run
 * @param {string} input.run the step's shell text
 * @param {string[]} [input.through] Atlas's hops from the step to the runner
 * @param {string} [input.dir] where the runner runs, from the root
 * @param {string[]} [input.dirs] every such directory, for a step that runs several
 * @param {boolean} [input.coverage] whether Atlas saw the run collect coverage
 * @param {string} [input.config] the runner's configuration file, from the root
 * @param {Set<string>} [input.env] variables the step, job or workflow already sets
 * @param {string} [input.jobText] the job's other shell text, for what it installs
 * @param {(path: string) => string | null} input.read a file of the repository
 * @returns {{ run?: string, env?: Record<string, string>, after?: Array<{ name: string, run: string, dir: string }>, coverage: string[], results: string[] } | { reason: string }}
 */
export function reportEdit(input) {
  const { runner } = input;
  if (runner === 'vitest') return vitest(input);
  if (runner === 'pytest') return pytest(input);
  if (runner === 'node --test') return nodeTest(input);
  if (runner === 'node') return { reason: 'the tests run as plain node scripts, which write no test results to upload' };
  return { reason: `the tool adds reports to Vitest, pytest and node --test runs; this step runs ${runner ?? 'no runner Atlas can name'}` };
}

// Words that start a command without being the program it runs.
const LEADS = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', 'time', 'env', 'exec', 'command', 'nohup', 'cross-env', 'dotenv']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
// Package-manager flags that take the next word as their value.
const MANAGER_VALUE_FLAGS = new Set(['-w', '--workspace', '--prefix', '-C', '--dir', '--filter', '-F', '--cwd']);

function program(words) {
  let at = 0;
  while (at < words.length && (LEADS.has(words[at].text) || ASSIGNMENT.test(words[at].text))) at += 1;
  return at;
}

function base(word) {
  return word.replace(/^.*\//, '');
}

function join(...parts) {
  const joined = posix.normalize(posix.join(...parts.filter((part) => part != null && part !== '')));
  return joined === '.' ? '' : joined.replace(/^\.\//, '').replace(/\/$/, '');
}

function readJson(read, path) {
  const text = read(path);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// JSON with comments and trailing commas, as tsconfig.json is written.
function readJsonc(read, path) {
  const text = read(path);
  if (text == null) return null;
  const bare = text.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match) => (match.startsWith('"') ? match : '')).replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(bare);
  } catch {
    return null;
  }
}

// A hop Atlas names between a step and its runner: a package script, run by
// a manager in a directory, or a file.
function hopOf(text) {
  const match = /^(npm|pnpm|yarn|bun)(?: run)? ([^\s()]+)(?: \((.+)\))?$/.exec(text);
  return match ? { text, manager: match[1], script: match[2], dir: match[3] ?? null } : { text, file: text };
}

/**
 * The script a manager command runs, and the index of the word naming it:
 * npm test, npm run build, pnpm test:coverage, yarn run lint.
 */
function managerScript(words, manager) {
  const at = program(words);
  if (base(words[at]?.text ?? '') !== manager) return null;
  let i = at + 1;
  const next = () => {
    while (i < words.length && words[i].text.startsWith('-')) {
      if (MANAGER_VALUE_FLAGS.has(words[i].text)) i += 1;
      i += 1;
    }
    return i < words.length ? i : null;
  };
  const sub = next();
  if (sub == null) return null;
  const word = words[sub].text;
  if (word === 'run' || word === 'run-script') {
    i = sub + 1;
    const script = next();
    return script == null ? null : { script: words[script].text, index: script };
  }
  if (manager === 'npm') return ['test', 't', 'tst'].includes(word) ? { script: 'test', index: sub } : word === 'start' ? { script: 'start', index: sub } : null;
  if (manager === 'bun') return null;
  return { script: word, index: sub };
}

// Where to add flags to a manager command, so they reach the script's
// command: npm wants them after a --, the others pass them on as they are.
function managerFlags(command, index, manager) {
  const after = command.words.slice(index + 1).map((word) => word.text);
  return { at: command.words.at(-1).end, prefix: manager === 'npm' && !after.includes('--') ? ' --' : '', args: after.filter((word) => word !== '--') };
}

function insert(run, at, text) {
  return run.slice(0, at) + text + run.slice(at);
}

// The top-level commands of a step's text that satisfy `pick`.
function commandsWhere(run, pick) {
  return simpleCommands(run).filter((command) => !command.nested && pick(command.words) != null);
}

function dependencies(pkg) {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}), ...(pkg?.optionalDependencies ?? {}) };
}

// A tsconfig's compiler options, with those of the configurations it
// extends by relative path under them.
function compilerOptions(read, path, depth = 0) {
  const config = readJsonc(read, path);
  if (config == null) return {};
  const own = config.compilerOptions ?? {};
  const parent = typeof config.extends === 'string' && config.extends.startsWith('.') && depth < 5
    ? compilerOptions(read, join(posix.dirname(path), config.extends.endsWith('.json') ? config.extends : `${config.extends}.json`), depth + 1)
    : {};
  return { ...parent, ...own };
}

// ---------------------------------------------------------------- Vitest

// What a flag's value is on the coverage leg, and on no other.
const LEG = "${{ env.COVERAGE_LEG == 'true' }}";
// Vitest's own default coverage reporters.
const VITEST_REPORTERS = ['text', 'html', 'clover', 'json'];
// The reports Codecov reads, by the file each reporter writes, best first.
const VITEST_FILES = [['lcov', 'lcov.info'], ['json', 'coverage-final.json'], ['cobertura', 'cobertura-coverage.xml'], ['clover', 'clover.xml']];

// The arguments of a command that runs Vitest, or null.
function vitestCall(words) {
  const at = program(words);
  const texts = words.map((word) => word.text);
  const name = base(texts[at] ?? '');
  const from = (i) => {
    while (i < texts.length && texts[i].startsWith('-')) i += 1;
    return i;
  };
  if (name === 'vitest') return { args: texts.slice(at + 1) };
  if (['npx', 'pnpx', 'bunx'].includes(name)) {
    const i = from(at + 1);
    return /^vitest(@|$)/.test(texts[i] ?? '') ? { args: texts.slice(i + 1) } : null;
  }
  if (['pnpm', 'yarn', 'bun', 'npm'].includes(name)) {
    let i = from(at + 1);
    if (['exec', 'dlx', 'x'].includes(texts[i])) i = from(i + 1);
    if (texts[i] === '--') i += 1;
    if (name === 'npm' && texts[at + 1] !== 'exec' && texts[at + 1] !== 'x') return null;
    return /^vitest(@|$)/.test(texts[i] ?? '') ? { args: texts.slice(i + 1) } : null;
  }
  if (name === 'node') {
    const i = from(at + 1);
    return /(^|\/)vitest(\.mjs)?$/.test(texts[i] ?? '') ? { args: texts.slice(i + 1) } : null;
  }
  return null;
}

// The flags of a Vitest command that decide where its reports go.
function vitestFlags(args) {
  const flags = { coverage: false, coverageReporters: [], reportsDirectory: null, reporters: [], outputFile: {}, config: null, root: false };
  for (let i = 0; i < args.length; i += 1) {
    const [name, inline] = args[i].includes('=') ? [args[i].slice(0, args[i].indexOf('=')), args[i].slice(args[i].indexOf('=') + 1)] : [args[i], null];
    const value = () => inline ?? (args[i + 1] != null && !args[i + 1].startsWith('-') ? args[++i] : null);
    if (name === '--coverage' || name === '--coverage.enabled') flags.coverage = inline == null || inline === 'true';
    else if (name === '--coverage.reporter') flags.coverageReporters.push(value());
    else if (name === '--coverage.reportsDirectory') flags.reportsDirectory = value();
    else if (name === '--reporter') flags.reporters.push(value());
    else if (name === '--outputFile') flags.outputFile.any = value();
    else if (name.startsWith('--outputFile.')) flags.outputFile[name.slice('--outputFile.'.length)] = value();
    else if (name === '--config' || name === '-c') flags.config = value();
    else if (name === '--root' || name === '-r') flags.root = true;
  }
  return flags;
}

function vitest({ run, through, coverage, config, dir = '', read }) {
  const hops = (through ?? []).map(hopOf);
  let at;
  let prefix;
  let args;
  let pkgDir = dir;
  const add = [];
  if (hops.length === 0) {
    const calls = commandsWhere(run, vitestCall);
    if (calls.length !== 1) return { reason: calls.length === 0 ? "the step's text has no Vitest command the tool can find" : `the step runs Vitest ${calls.length} times; name the one to report` };
    at = calls[0].words.at(-1).end;
    prefix = '';
    args = vitestCall(calls[0].words).args;
  } else if (hops.length === 1 && hops[0].script) {
    const [hop] = hops;
    pkgDir = hop.dir ?? dir;
    const calls = commandsWhere(run, (words) => (managerScript(words, hop.manager)?.script === hop.script ? true : null));
    if (calls.length !== 1) return { reason: calls.length === 0 ? `the tool cannot find ${hop.text} in the step's text` : `the step runs ${hop.text} ${calls.length} times; name the one to report` };
    const script = dependenciesScript(read, pkgDir, hop.script);
    if (script == null) return { reason: `${join(pkgDir, 'package.json')} has no script ${hop.script}` };
    const inside = simpleCommands(script).filter((command) => !command.nested);
    if (inside.length !== 1) return { reason: `the script ${hop.script} runs more than Vitest (${script}); a flag added to the step would reach its last command` };
    const call = vitestCall(inside[0].words);
    if (call == null) return { reason: `the script ${hop.script} runs ${script}, not Vitest itself; a flag added to the step would not reach Vitest` };
    const found = managerScript(calls[0].words, hop.manager);
    const place = managerFlags(calls[0], found.index, hop.manager);
    at = place.at;
    prefix = place.prefix;
    args = [...call.args, ...place.args];
  } else {
    return { reason: `the step runs Vitest through ${hops.map((hop) => hop.text).join(', then ')}; a flag added to the step would not reach Vitest` };
  }
  const flags = vitestFlags(args);
  if (flags.root) return { reason: 'the command sets --root; the reports would land under it' };
  const configPath = flags.config != null ? join(dir, flags.config) : config ?? null;
  const settings = configPath == null ? {} : vitestSettings(read(configPath), configPath);
  if (settings.reason) return settings;
  const on = coverage || flags.coverage || settings.enabled === true;
  if (!on) {
    const provider = `@vitest/coverage-${settings.provider ?? 'v8'}`;
    const deps = { ...dependencies(readJson(read, join(pkgDir, 'package.json'))), ...dependencies(readJson(read, 'package.json')) };
    if (!(provider in deps)) return { reason: `Vitest collects no coverage here and ${provider} is not a dependency; add it at the version of vitest` };
    // On the coverage leg only: every other leg runs as fast as before.
    add.push(`--coverage.enabled=${LEG}`);
  }
  const reporters = flags.coverageReporters.length > 0 ? flags.coverageReporters : settings.reporter ?? VITEST_REPORTERS;
  let file = VITEST_FILES.find(([reporter]) => reporters.includes(reporter))?.[1];
  if (file == null) {
    if (flags.coverageReporters.length === 0) for (const reporter of reporters) add.push(`--coverage.reporter=${reporter}`);
    add.push('--coverage.reporter=lcov');
    file = 'lcov.info';
  }
  const reportsDirectory = flags.reportsDirectory ?? settings.reportsDirectory ?? 'coverage';
  const testReporters = flags.reporters.length > 0 ? flags.reporters : settings.reporters ?? [];
  let results = 'junit.xml';
  if (testReporters.includes('junit')) {
    const named = flags.reporters.length > 0 ? flags.outputFile.junit ?? flags.outputFile.any : settings.outputFile?.junit ?? settings.outputFile?.any;
    if (named == null) add.push('--outputFile.junit=junit.xml');
    else results = named;
  } else {
    if (flags.reporters.length === 0) for (const reporter of settings.reporters ?? ['default']) add.push(`--reporter=${reporter}`);
    add.push('--reporter=junit', '--outputFile.junit=junit.xml');
  }
  return { run: add.length > 0 ? insert(run, at, `${prefix} ${add.join(' ')}`) : run, coverage: [join(dir, reportsDirectory, file)], results: [join(dir, results)] };
}

function dependenciesScript(read, dir, name) {
  const scripts = readJson(read, join(dir, 'package.json'))?.scripts;
  return typeof scripts?.[name] === 'string' ? scripts[name] : null;
}

/**
 * The settings of a Vitest configuration that decide where its reports go,
 * read from literal values only; the reason instead when one is computed.
 */
function vitestSettings(text, path) {
  if (text == null) return {};
  let ast;
  try {
    ast = parseScript(text, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
  } catch {
    return { reason: `${path} could not be read as JavaScript or TypeScript` };
  }
  const blocks = [];
  let merged = false;
  const walk = (node, depth) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth);
      return;
    }
    if (node.type === 'CallExpression' && node.callee?.name === 'mergeConfig') merged = true;
    if (node.type === 'ObjectProperty' && keyOf(node) === 'test' && node.value.type === 'ObjectExpression') blocks.push({ node: node.value, depth, parent: null });
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
      walk(node[key], depth + 1);
    }
  };
  walk(ast.program, 0);
  if (blocks.length === 0) return merged ? { reason: `${path} takes its test settings from another configuration` } : {};
  const top = Math.min(...blocks.map((block) => block.depth));
  const outer = blocks.filter((block) => block.depth === top);
  if (outer.length > 1) return { reason: `${path} has more than one test block` };
  const test = outer[0].node;
  if (test.properties.some((property) => property.type === 'SpreadElement')) return { reason: `${path} spreads settings into its test block from elsewhere` };
  const settings = {};
  const field = (object, name) => object.properties.find((property) => property.type === 'ObjectProperty' && keyOf(property) === name)?.value ?? null;
  if (field(test, 'root') != null) return { reason: `${path} sets test.root; the reports would land under it` };
  const coverage = field(test, 'coverage');
  if (coverage != null) {
    if (coverage.type !== 'ObjectExpression' || coverage.properties.some((property) => property.type === 'SpreadElement')) return { reason: `${path} sets coverage from an expression; the tool reads only literal values` };
    const reporter = field(coverage, 'reporter');
    if (reporter != null) {
      settings.reporter = reporterList(reporter);
      if (settings.reporter == null) return { reason: `${path} sets coverage.reporter from an expression; the tool reads only literal values` };
    }
    const directory = field(coverage, 'reportsDirectory');
    if (directory != null) {
      settings.reportsDirectory = literal(directory);
      if (settings.reportsDirectory == null) return { reason: `${path} sets coverage.reportsDirectory from an expression; the tool reads only literal values` };
    }
    const enabled = field(coverage, 'enabled');
    if (enabled?.type === 'BooleanLiteral') settings.enabled = enabled.value;
    const provider = field(coverage, 'provider');
    if (provider != null) settings.provider = literal(provider);
  }
  const reporters = field(test, 'reporters');
  if (reporters != null) {
    settings.reporters = reporterList(reporters);
    if (settings.reporters == null) return { reason: `${path} sets test.reporters from an expression; the tool reads only literal values` };
  }
  const outputFile = field(test, 'outputFile');
  if (outputFile != null) {
    if (literal(outputFile) != null) settings.outputFile = { any: literal(outputFile) };
    else if (outputFile.type === 'ObjectExpression') settings.outputFile = { junit: literal(field(outputFile, 'junit') ?? { type: 'none' }) ?? undefined };
    else return { reason: `${path} sets test.outputFile from an expression; the tool reads only literal values` };
  }
  return settings;
}

function keyOf(property) {
  if (property.computed) return null;
  return property.key.type === 'Identifier' ? property.key.name : property.key.type === 'StringLiteral' ? property.key.value : null;
}

function literal(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

// A reporter setting's names: 'lcov', ['text', 'lcov'], or [['json', {}]]
// with no options; null for anything computed or carrying options.
function reporterList(node) {
  if (literal(node) != null) return [literal(node)];
  if (node.type !== 'ArrayExpression') return null;
  const out = [];
  for (const element of node.elements) {
    if (literal(element) != null) out.push(literal(element));
    else if (element?.type === 'ArrayExpression' && element.elements.length === 1 && literal(element.elements[0]) != null) out.push(literal(element.elements[0]));
    else return null;
  }
  return out;
}

// ---------------------------------------------------------------- pytest

// The arguments of a command that runs pytest, or null.
function pytestCall(words) {
  const texts = words.map((word) => word.text);
  let at = program(words);
  const skipFlags = (i, valued) => {
    while (i < texts.length && texts[i].startsWith('-')) {
      if (valued.has(texts[i])) i += 1;
      i += 1;
    }
    return i;
  };
  for (;;) {
    const name = base(texts[at] ?? '');
    if (name === 'pytest' || name === 'py.test') return { args: texts.slice(at + 1) };
    if (/^(python[0-9.]*|py)$/.test(name)) {
      const i = skipFlags(at + 1, new Set());
      return texts[i - 1] === '-m' && texts[i] === 'pytest' ? { args: texts.slice(i + 1) } : texts[i] === '-m' && texts[i + 1] === 'pytest' ? { args: texts.slice(i + 2) } : null;
    }
    if (name === 'uv' && texts[at + 1] === 'run') {
      at = skipFlags(at + 2, new Set(['--with', '--python', '-p', '--group', '--extra', '--package', '--project', '--directory', '--env-file']));
      continue;
    }
    if (['poetry', 'pipenv', 'hatch', 'pdm', 'rye'].includes(name) && texts[at + 1] === 'run') {
      at += 2;
      continue;
    }
    if (name === 'coverage' && texts[at + 1] === 'run') {
      const i = texts.indexOf('pytest', at);
      return i === -1 ? null : { args: texts.slice(i + 1), coverageRun: true };
    }
    return null;
  }
}

// A pytest option's values across the command and addopts: --x=v and --x v.
function optionValues(words, names) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    for (const name of names) {
      if (words[i] === name && words[i + 1] != null && !words[i + 1].startsWith('-')) out.push(words[i + 1]);
      else if (words[i].startsWith(`${name}=`)) out.push(words[i].slice(name.length + 1));
    }
  }
  return out;
}

// The sections of an INI file, each a map of key to value.
function readIni(text) {
  const sections = new Map();
  let section = null;
  let key = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (/^\s*[#;]/.test(raw) || raw.trim() === '') continue;
    const head = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
    if (head) {
      section = new Map();
      sections.set(head[1].trim(), section);
      key = null;
      continue;
    }
    if (section == null) continue;
    if (/^\s/.test(raw) && key != null) {
      section.set(key, `${section.get(key)} ${raw.trim()}`.trim());
      continue;
    }
    const pair = /^([^=:]+)[=:](.*)$/.exec(raw);
    if (pair) {
      key = pair[1].trim();
      section.set(key, pair[2].trim());
    }
  }
  return sections;
}

// pytest's addopts, from the configuration file it reads.
function addoptsOf(read, dir, config) {
  const candidates = config ? [config] : ['pytest.ini', 'pyproject.toml', 'tox.ini', 'setup.cfg'].map((name) => join(dir, name));
  for (const path of candidates) {
    const text = read(path);
    if (text == null) continue;
    let value = null;
    if (path.endsWith('.toml')) {
      const options = parseToml(text)?.tool?.pytest?.ini_options;
      if (options == null) continue;
      value = options.addopts ?? null;
    } else {
      const section = readIni(text).get(path.endsWith('setup.cfg') ? 'tool:pytest' : 'pytest');
      if (section == null) continue;
      value = section.get('addopts') ?? null;
    }
    if (value == null) return [];
    const joined = Array.isArray(value) ? value.join(' ') : String(value);
    return simpleCommands(joined).flatMap((command) => command.words.map((word) => word.text));
  }
  return [];
}

// Every requirement the repository declares, as text, and what its jobs install.
function pythonRequirements(read, dir, jobText) {
  const out = [String(jobText ?? '')];
  const pyproject = parseToml(read(join(dir, 'pyproject.toml')) ?? read('pyproject.toml') ?? '');
  const lists = [pyproject?.project?.dependencies, ...Object.values(pyproject?.project?.['optional-dependencies'] ?? {}), ...Object.values(pyproject?.['dependency-groups'] ?? {})];
  for (const list of lists) if (Array.isArray(list)) out.push(...list.map(String));
  const poetry = pyproject?.tool?.poetry;
  for (const table of [poetry?.dependencies, poetry?.['dev-dependencies'], ...Object.values(poetry?.group ?? {}).map((group) => group?.dependencies)]) {
    if (table && typeof table === 'object') out.push(...Object.keys(table));
  }
  for (const name of ['requirements.txt', 'requirements-dev.txt', 'requirements_dev.txt', 'requirements-test.txt', 'dev-requirements.txt', 'test-requirements.txt', 'requirements/dev.txt', 'requirements/test.txt', 'setup.cfg', 'setup.py', 'tox.ini']) {
    const text = read(join(dir, name));
    if (text != null) out.push(text);
  }
  return out.join('\n');
}

// What coverage.py is configured with: its source, and where its XML goes.
function coverageSettings(read, dir) {
  const pyproject = parseToml(read(join(dir, 'pyproject.toml')) ?? '');
  const toml = pyproject?.tool?.coverage;
  const rc = readIni(read(join(dir, '.coveragerc')) ?? '');
  const cfg = readIni(read(join(dir, 'setup.cfg')) ?? '');
  const source = toml?.run?.source ?? rc.get('run')?.get('source') ?? cfg.get('coverage:run')?.get('source') ?? null;
  const output = toml?.xml?.output ?? rc.get('xml')?.get('output') ?? cfg.get('coverage:xml')?.get('output') ?? null;
  return { source: source == null || (Array.isArray(source) && source.length === 0) ? null : source, output, name: pyproject?.project?.name ?? null };
}

function pytest({ run, through, coverage, config, dir = '', read, jobText }) {
  if ((through ?? []).length > 0) return { reason: `the step runs pytest through ${through.join(', then ')}; a flag added to the step would not reach pytest` };
  const calls = commandsWhere(run, pytestCall);
  if (calls.length === 0) return { reason: "the step's text has no pytest command the tool can find" };
  if (calls.length > 1) return { reason: `the step runs pytest ${calls.length} times; name the one to report` };
  const call = pytestCall(calls[0].words);
  if (call.coverageRun) return { reason: 'the step runs pytest under coverage run; add coverage xml after it by hand' };
  const words = [...call.args, ...addoptsOf(read, dir, config)];
  const settings = coverageSettings(read, dir);
  const add = [];
  const reports = optionValues(words, ['--cov-report']);
  const on = !words.includes('--no-cov') && (coverage || words.some((word) => word === '--cov' || word.startsWith('--cov=')));
  let file;
  if (on) {
    const xml = reports.find((report) => report === 'xml' || report.startsWith('xml:'));
    if (xml != null) file = xml.includes(':') ? xml.slice(4) : settings.output ?? 'coverage.xml';
    else {
      if (reports.length === 0) add.push('--cov-report=term');
      add.push('--cov-report=xml');
      file = settings.output ?? 'coverage.xml';
    }
  } else {
    if (!/(^|[^A-Za-z0-9_-])pytest[-_]cov([^A-Za-z0-9_-]|$)/im.test(pythonRequirements(read, dir, jobText))) return { reason: 'pytest collects no coverage here and pytest-cov is not a dependency' };
    let measured = null;
    if (settings.source != null) measured = '--cov';
    else if (settings.name != null) {
      const module = settings.name.toLowerCase().replace(/[-.]+/g, '_');
      if (read(join(dir, module, '__init__.py')) != null || read(join(dir, 'src', module, '__init__.py')) != null) measured = `--cov=${module}`;
    }
    if (measured == null) return { reason: `pytest-cov is a dependency but no package to measure was found: no [tool.coverage.run] source, and ${settings.name ?? 'the project'} is not a package at the root or under src/` };
    // On the coverage leg only: every other leg runs as fast as before.
    add.push(`\${{ env.COVERAGE_LEG == 'true' && '${measured} --cov-report=term --cov-report=xml' || '' }}`);
    file = settings.output ?? 'coverage.xml';
  }
  const junit = optionValues(words, ['--junitxml', '--junit-xml']);
  let results = 'junit.xml';
  if (junit.length > 0) {
    if (junit[0].includes('$')) return { reason: `the JUnit file's name (${junit[0]}) is made at run time` };
    results = junit[0];
  } else add.push('--junitxml=junit.xml');
  return { run: add.length > 0 ? insert(run, calls[0].words.at(-1).end, ` ${add.join(' ')}`) : run, coverage: [join(dir, file)], results: [join(dir, results)] };
}

// ---------------------------------------------------------------- node --test

// On the coverage leg the test runner writes JUnit beside its own output; elsewhere the variable is empty, which Node reads as unset.
const NODE_OPTIONS = "${{ env.COVERAGE_LEG == 'true' && '--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=junit.xml' || '' }}";
const NODE_V8_COVERAGE = "${{ env.COVERAGE_LEG == 'true' && format('{0}/v8-coverage', runner.temp) || '' }}";
// c8 flags that choose what a report covers and where it is, which a later
// c8 report must repeat; the rest only print or judge the report.
const C8_KEPT = new Set(['--include', '-n', '--exclude', '-x', '--extension', '-e', '--all', '-a', '--src', '--exclude-after-remap', '--exclude-node-modules', '--allowExternal', '--allow-external', '--temp-directory', '--reports-dir', '--report-dir', '-o', '--omit-relative', '--resolve', '--merge-async', '--experimental-monocart', '--skip-full', '--config', '-c']);
const C8_DROPPED = new Set(['--reporter', '-r', '--check-coverage', '--lines', '--functions', '--branches', '--statements', '--per-file', '--100', '--clean']);
const C8_VALUED = new Set(['--include', '-n', '--exclude', '-x', '--extension', '-e', '--src', '--temp-directory', '--reports-dir', '--report-dir', '-o', '--config', '-c', '--reporter', '-r', '--lines', '--functions', '--branches', '--statements', '--resolve']);
const BUILT = /^(?:\.\/)?(dist|build|out)\//;

// The texts the step reaches on its way to the runner: each package script
// Atlas names, and each file it names.
function chainOf(through, dir, read) {
  const out = [];
  for (const hop of (through ?? []).map(hopOf)) {
    if (hop.script) {
      const at = hop.dir ?? dir;
      const text = dependenciesScript(read, at, hop.script);
      if (text != null) out.push({ name: `script ${hop.script}`, text, dir: at });
    } else {
      const text = read(join(dir, hop.file));
      if (text != null) out.push({ name: hop.file, text, dir });
    }
  }
  return out;
}

// c8 as a command runs it: its flags, up to the program it runs.
function c8Call(words) {
  const texts = words.map((word) => word.text);
  let at = program(words);
  if (['npx', 'pnpx', 'bunx'].includes(base(texts[at] ?? ''))) {
    at += 1;
    while (texts[at]?.startsWith('-')) at += 1;
  }
  if (!/^c8(@|$)/.test(base(texts[at] ?? '')) || ['report', 'check-coverage'].includes(texts[at + 1])) return null;
  const flags = [];
  for (let i = at + 1; i < texts.length && texts[i].startsWith('-'); i += 1) {
    const name = texts[i].includes('=') ? texts[i].slice(0, texts[i].indexOf('=')) : texts[i];
    if (C8_VALUED.has(name) && !texts[i].includes('=') && texts[i + 1] != null) {
      flags.push({ name, text: `${texts[i]} ${texts[i + 1]}`, value: texts[i + 1] });
      i += 1;
    } else flags.push({ name, text: texts[i], value: texts[i].includes('=') ? texts[i].slice(name.length + 1) : null });
  }
  return { flags };
}

// c8's reporters and report directory: its flags over its configuration
// file over package.json's "c8", as c8 reads them.
function c8Settings(read, dir, flags) {
  const configFlag = flags.find((flag) => flag.name === '--config' || flag.name === '-c');
  let file = null;
  if (configFlag) file = readJson(read, join(dir, configFlag.value));
  else {
    for (let at = dir; ; at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '') {
      for (const name of ['.c8rc', '.c8rc.json', '.nycrc', '.nycrc.json']) {
        file ??= readJson(read, join(at, name));
      }
      if (file != null || at === '') break;
    }
  }
  const pkg = readJson(read, join(dir, 'package.json'))?.c8 ?? (dir !== '' ? readJson(read, 'package.json')?.c8 : null) ?? {};
  const list = (value) => (value == null ? null : Array.isArray(value) ? value.map(String) : [String(value)]);
  const flagged = flags.filter((flag) => flag.name === '--reporter' || flag.name === '-r').map((flag) => flag.value);
  const reporters = flagged.length > 0 ? flagged : list(file?.reporter) ?? list(pkg.reporter) ?? ['text'];
  const dirFlag = flags.find((flag) => ['--reports-dir', '--report-dir', '-o'].includes(flag.name));
  const reportsDir = dirFlag?.value ?? file?.['reports-dir'] ?? file?.reportsDir ?? file?.['report-dir'] ?? pkg['reports-dir'] ?? pkg.reportsDir ?? pkg['report-dir'] ?? 'coverage';
  return { reporters, reportsDir: String(reportsDir) };
}

// Positional words of each node --test command in the texts.
function nodeTestFiles(texts) {
  const out = [];
  for (const { text, dir } of texts) {
    for (const command of simpleCommands(text)) {
      const words = command.words.map((word) => word.text);
      const at = program(command.words);
      if (base(words[at] ?? '') !== 'node' || !words.slice(at + 1).includes('--test')) continue;
      for (const word of words.slice(at + 1)) if (!word.startsWith('-')) out.push({ path: word, dir });
    }
  }
  return out;
}

function nodeTest({ run, through, coverage, dir = '', dirs, env, read }) {
  if (env?.has('NODE_OPTIONS')) return { reason: 'the step already sets NODE_OPTIONS, which the JUnit reporter would be added to' };
  const chain = chainOf(through, dir, read);
  if (/--test-reporter\b/.test(run)) return { reason: "the step names its own --test-reporter; a reporter added through NODE_OPTIONS would not pair with its destinations" };
  for (const link of chain) {
    if (/--test-reporter\b/.test(link.text)) return { reason: `the ${link.name} names its own --test-reporter; a reporter added through NODE_OPTIONS would not pair with its destinations` };
  }
  const results = [...new Set((dirs && dirs.length > 0 ? dirs : [dir]).map((at) => join(at, 'junit.xml')))].sort();
  const texts = [{ text: run, dir }, ...chain];
  if (coverage) {
    let found = null;
    for (const { text, dir: at } of texts) {
      for (const command of simpleCommands(text)) {
        const call = c8Call(command.words);
        if (call) found ??= { ...call, dir: at };
      }
    }
    if (found == null) {
      if (texts.some(({ text }) => text.includes('--experimental-test-coverage'))) return { reason: "the run measures coverage with node's own --experimental-test-coverage; add its lcov reporter by hand" };
      return { reason: 'the run collects coverage with a tool other than c8; add its lcov report by hand' };
    }
    const unknown = found.flags.find((flag) => !C8_KEPT.has(flag.name) && !C8_DROPPED.has(flag.name));
    if (unknown) return { reason: `c8 runs with ${unknown.text}, which the tool does not know how to repeat in a later report` };
    const settings = c8Settings(read, found.dir, found.flags);
    const report = join(found.dir, settings.reportsDir, 'lcov.info');
    if (settings.reporters.includes('lcov')) return { env: { NODE_OPTIONS }, after: [], coverage: [report], results };
    const kept = found.flags.filter((flag) => C8_KEPT.has(flag.name)).map((flag) => flag.text);
    return { env: { NODE_OPTIONS }, after: [{ name: 'Coverage report for Codecov', run: ['npx c8 report', ...kept, '--reporter=lcov'].join(' '), dir: found.dir }], coverage: [report], results };
  }
  const built = nodeTestFiles(texts).find(({ path }) => BUILT.test(path));
  if (built) {
    const options = compilerOptions(read, join(built.dir, 'tsconfig.json'));
    if (options.sourceMap !== true && options.inlineSourceMap !== true) {
      return { reason: `the tests run from ${BUILT.exec(built.path)[1]}/, built without source maps, so coverage would name built files; turn on sourceMap in tsconfig.json` };
    }
  }
  return {
    env: { NODE_OPTIONS, NODE_V8_COVERAGE },
    after: [{ name: 'Coverage report for Codecov', run: `npx --yes ${C8} report --temp-directory "$RUNNER_TEMP/v8-coverage" --reporter=lcov --reporter=text-summary --report-dir coverage/c8`, dir: '' }],
    coverage: ['coverage/c8/lcov.info'],
    results,
  };
}
