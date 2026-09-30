import { posix } from 'node:path';
import semver from 'semver';
import { lockFor, lockPackages, packageByBin } from './lockfile.js';
import { pep440Range } from './runtime.js';

/**
 * Two checks on a workflow door (docs/atlas-production.spec.md, Part 3),
 * each a fact about committed files, never a prediction of a run:
 *
 * D1, toolchain. A step runs a tool whose package is in the lock of the
 * step's directory, the job pins a Node version before that step in a form
 * known offline, and the package's engines.node excludes every version the
 * pin can resolve to. Its Python form (D1-python) holds a setup-python pin
 * against the requires-python of the package a step installs or tests.
 *
 * Each finding carries its rule, job and step, the facts it rests on and the
 * lines they were read from. What a check could not judge (no setup step, a
 * pin only a run can know, a lock it cannot read) is returned apart as
 * unresolved, never as a finding.
 */

// The tools whose own start script checks the Node version and exits 1, so
// a pin below their engines means the step fails: Astro's bin/astro.mjs and
// Next.js's bin/next.ts (read on their main branches, 2026-09-30; see the
// research grounding of docs/atlas-production.spec.md). Any other tool only
// declares what it needs.
const REFUSES = new Map([
  ['astro', 'withastro/astro, packages/astro/bin/astro.mjs'],
  ['next', 'vercel/next.js, packages/next/src/bin/next.ts'],
]);

// Programs that are the runtime or a package manager, not a package's tool.
const NOT_A_TOOL = new Set(['node', 'nodejs', 'npm', 'npx', 'pnpm', 'yarn', 'corepack', 'bun', 'deno', 'sh', 'bash']);

const NPM_INSTALLS = new Set(['ci', 'clean-install', 'ic', 'install-clean', 'isntall-clean', 'install', 'i', 'in', 'ins', 'inst', 'insta', 'instal', 'isnt', 'isnta', 'isntal', 'isntall', 'add']);
// The npm flags that take a value, so the value is not taken for a package.
const NPM_VALUE_FLAGS = new Set(['--prefix', '-w', '--workspace', '--omit', '--include', '--registry', '--cache', '--loglevel', '--userconfig', '--install-strategy', '--before', '--tag']);

/**
 * @param {{ file: string, jobs: object[], steps: Map<string, object[]>, repo: object }} door
 *   jobs are the runtimes of core/runtime.js, each setup entry with its step
 *   index and line; steps, by job, are the steps that run commands, each with
 *   its index, name, line and the invocations core/commands.js read
 * @returns {{ findings: object[], unresolved: object[] }}
 */
export function checkDoor({ file, jobs, steps, repo }) {
  const findings = [];
  const unresolved = [];
  const unreadLocks = new Set();
  for (const job of jobs) {
    for (const step of steps.get(job.name) ?? []) {
      toolchain({ file, job, step, repo, findings, unresolved, unreadLocks });
      pythonToolchain({ file, job, step, repo, findings, unresolved });
    }
  }
  return { findings: sortFacts(findings), unresolved: sortFacts(dedupe(unresolved)) };
}

// The setup pin of a tool that holds for a step: the last setup step of the
// job before it.
function pinBefore(job, uses, index) {
  return (job.setup ?? []).filter((entry) => entry.uses === uses && entry.index < index).at(-1) ?? null;
}

function toolchain({ file, job, step, repo, findings, unresolved, unreadLocks }) {
  const pin = pinBefore(job, 'actions/setup-node', step.index);
  for (const run of step.invocations) {
    const strict = engineStrict(repo, run);
    if (strict) {
      strictInstall({ file, job, step, repo, run, pin, strict, findings, unresolved });
      continue;
    }
    if (!run.local || NOT_A_TOOL.has(run.program)) continue;
    const found = lockFor(repo, run.dir);
    if (!found) continue;
    if (!found.lock.ok) {
      if (!unreadLocks.has(found.path)) unresolved.push({ rule: 'D1', job: job.name, step: step.step, lock: found.path, why: found.lock.unresolved });
      unreadLocks.add(found.path);
      continue;
    }
    const pkg = packageByBin(found.lock, found.within, run.program);
    const requires = pkg?.engines?.node;
    if (typeof requires !== 'string') continue;
    const tool = toolName(run, repo);
    const facts = { rule: 'D1', job: job.name, step: step.step, tool, package: pkg.name, ...(pkg.version ? { version: pkg.version } : {}), requires };
    if (!pin) {
      unresolved.push({ ...facts, why: 'no setup-node step before it' });
      continue;
    }
    if (pin.unresolved) {
      unresolved.push({ ...facts, why: pin.unresolved });
      continue;
    }
    if (semver.validRange(requires) == null) {
      unresolved.push({ ...facts, why: 'engines.node does not parse' });
      continue;
    }
    const excluded = pin.ranges.filter((entry) => !semver.intersects(entry.range, requires));
    if (excluded.length === 0) continue;
    findings.push({
      ...facts,
      pins: excluded.map((entry) => entry.from),
      ...(pin.ranges.length > 1 ? { legs: pin.ranges.length } : {}),
      pinnedBy: pinnedBy(pin),
      ...(REFUSES.has(pkg.name) ? { refuses: true } : {}),
      lines: lines([[file, pin.line], [step.file ?? file, step.line], [found.path, pkg.line]]),
    });
  }
}

// A tracked .npmrc in the step's directory or the lock's that sets
// engine-strict makes npm ci and npm install refuse a package whose engines
// exclude the running Node, so every package the lock installs is read.
function engineStrict(repo, run) {
  if (run.program !== 'npm' || !installsHere(run)) return null;
  const dir = installDir(run);
  if (dir == null) return null;
  const found = lockFor(repo, dir);
  for (const at of [...new Set([dir, found?.dir].filter((entry) => entry != null))]) {
    const path = at === '' ? '.npmrc' : `${at}/.npmrc`;
    if (!repo.tracked.has(path)) continue;
    const text = repo.text(path) ?? '';
    if (/^\s*engine-strict\s*=\s*true\s*$/m.test(text)) return { path, dir, found };
  }
  return null;
}

function strictInstall({ file, job, step, pin, strict, findings, unresolved }) {
  const { found } = strict;
  if (!found || !found.lock.ok) return;
  const base = { rule: 'D1', job: job.name, step: step.step, tool: 'npm ci', engineStrict: strict.path };
  if (!pin || pin.unresolved) {
    unresolved.push({ ...base, why: pin ? pin.unresolved : 'no setup-node step before it' });
    return;
  }
  const refused = [];
  for (const pkg of lockPackages(found.lock)) {
    const requires = pkg.engines?.node;
    if (pkg.optional || typeof requires !== 'string' || semver.validRange(requires) == null) continue;
    const excluded = pin.ranges.filter((entry) => !semver.intersects(entry.range, requires));
    if (excluded.length > 0) refused.push({ package: pkg.name, ...(pkg.version ? { version: pkg.version } : {}), requires, line: pkg.line, pins: excluded.map((entry) => entry.from) });
  }
  if (refused.length === 0) return;
  const first = refused[0];
  findings.push({
    ...base,
    package: first.package,
    ...(first.version ? { version: first.version } : {}),
    requires: first.requires,
    ...(refused.length > 1 ? { alsoRefused: refused.length - 1 } : {}),
    pins: [...new Set(refused.flatMap((entry) => entry.pins))],
    ...(pin.ranges.length > 1 ? { legs: pin.ranges.length } : {}),
    pinnedBy: pinnedBy(pin),
    refuses: true,
    lines: lines([[file, pin.line], [step.file ?? file, step.line], [strict.path, 1], [found.path, first.line]]),
  });
}

/**
 * The Python form: a setup-python pin before a step that installs or tests
 * the package in its directory, against the requires-python of the
 * pyproject.toml there or above it.
 */
function pythonToolchain({ file, job, step, repo, findings, unresolved }) {
  const pin = pinBefore(job, 'actions/setup-python', step.index);
  const seen = new Set();
  for (const run of step.invocations) {
    const dir = pythonTarget(run);
    if (dir == null) continue;
    const manifest = nearest(repo, dir, 'pyproject.toml');
    if (!manifest || seen.has(manifest)) continue;
    seen.add(manifest);
    const text = repo.text(manifest) ?? '';
    const declared = /^\s*requires-python\s*=\s*(["'])([^"'\n]*)\1/m.exec(text);
    if (!declared) continue;
    const requires = declared[2].trim();
    const facts = { rule: 'D1-python', job: job.name, step: step.step, tool: toolName(run, repo), manifest, requires };
    if (!pin) {
      unresolved.push({ ...facts, why: 'no setup-python step before it' });
      continue;
    }
    if (pin.unresolved) {
      unresolved.push({ ...facts, why: pin.unresolved });
      continue;
    }
    const range = pep440Range(requires);
    if (range == null) {
      unresolved.push({ ...facts, why: 'requires-python does not read as a range' });
      continue;
    }
    const excluded = pin.ranges.filter((entry) => !semver.intersects(entry.range, range));
    if (excluded.length === 0) continue;
    const line = text.split('\n').findIndex((entry) => /^\s*requires-python\s*=/.test(entry)) + 1;
    findings.push({
      ...facts,
      pins: excluded.map((entry) => entry.from),
      ...(pin.ranges.length > 1 ? { legs: pin.ranges.length } : {}),
      pinnedBy: pinnedBy(pin),
      lines: lines([[file, pin.line], [step.file ?? file, step.line], [manifest, line || null]]),
    });
  }
}

// The directory whose package a Python command installs or tests: pip
// install of a directory (., -e ., .[dev]), uv sync, poetry install, and
// pytest; null for any other command.
function pythonTarget(run) {
  let program = run.program;
  let args = run.args;
  if (/^python(?:\d+(?:\.\d+)*)?$/.test(program) && args[0] === '-m' && args[1]) {
    program = args[1];
    args = args.slice(2);
  }
  if (program === 'pytest' || program === 'py.test') return run.dir;
  if (program === 'uv' && args[0] === 'sync') return run.dir;
  if (program === 'poetry' && args[0] === 'install') return run.dir;
  if (program === 'uv' && args[0] === 'pip') {
    program = 'pip';
    args = args.slice(1);
  }
  if (!/^pip3?$/.test(program) || args[0] !== 'install') return null;
  const target = args.slice(1).find((arg, index, all) => !arg.startsWith('-') && !['-r', '--requirement', '-c', '--constraint'].includes(all[index - 1]));
  if (target == null) return null;
  const path = target.replace(/\[[^\]]*\]$/, '');
  if (!(path === '.' || path.startsWith('./') || path.startsWith('../'))) return null;
  const joined = posix.normalize(posix.join(run.dir || '.', path));
  return joined === '.' ? '' : joined.startsWith('..') ? null : joined.replace(/\/+$/, '');
}

function nearest(repo, dir, name) {
  let at = dir;
  for (;;) {
    const path = at === '' ? name : `${at}/${name}`;
    if (repo.tracked.has(path)) return path;
    if (at === '') return null;
    at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '';
  }
}

// Whether an npm command installs the directory's own dependencies from its
// lock: npm ci, or npm install with no package named and not global.
function installsHere(run) {
  const words = positionals(run.args);
  if (!NPM_INSTALLS.has(words[0])) return false;
  if (run.args.some((arg) => arg === '-g' || arg === '--global' || arg === '--location=global')) return false;
  return words.length === 1;
}

// The directory an npm command runs in, after --prefix.
function installDir(run) {
  let dir = run.dir;
  run.args.forEach((arg, index) => {
    const value = arg === '--prefix' ? run.args[index + 1] : arg.startsWith('--prefix=') ? arg.slice('--prefix='.length) : null;
    if (value == null || dir == null) return;
    const joined = posix.normalize(posix.join(dir || '.', value));
    dir = joined === '.' ? '' : joined.startsWith('..') || joined.startsWith('/') || joined.includes('$') ? null : joined.replace(/\/+$/, '');
  });
  return dir;
}

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') break;
    if (arg.startsWith('-')) {
      if (NPM_VALUE_FLAGS.has(arg)) i += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}

// A tool by its program and the subcommand it is handed: astro build. A
// first argument that names a path of the repository is what the tool is
// handed, not a subcommand (docs-lint src).
function toolName(run, repo = null) {
  const sub = run.args.find((arg) => !arg.startsWith('-'));
  if (sub == null || !/^[a-z][\w:-]*$/.test(sub)) return run.program;
  const path = run.dir === '' ? sub : `${run.dir}/${sub}`;
  if (repo && (repo.tracked.has(path) || repo.dirs?.has(path))) return run.program;
  return `${run.program} ${sub}`;
}

function pinnedBy(pin) {
  return { step: pin.step, ...(pin.version != null ? { version: pin.version } : {}), ...(pin.versionFile != null && pin.version == null ? { versionFile: pin.versionFile } : {}) };
}

function lines(entries) {
  const out = [];
  for (const [path, line] of entries) {
    if (path == null) continue;
    const entry = { file: path, ...(line != null ? { line } : {}) };
    if (!out.some((item) => item.file === entry.file && item.line === entry.line)) out.push(entry);
  }
  return out;
}

function dedupe(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortFacts(entries) {
  const key = (entry) => [entry.rule, entry.job ?? '', entry.step ?? '', entry.tool ?? '', entry.package ?? entry.lock ?? entry.manifest ?? ''].join('\0');
  return [...entries].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Sentences. The map records facts; these words are made from them wherever
// a finding shows (atlas check, explain, the sidecar).

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function pinPhrase(finding, runtime) {
  const pinned = finding.pinnedBy?.versionFile ? ` (from ${finding.pinnedBy.versionFile})` : '';
  const legs = finding.legs ? ` on ${finding.pins.length === 1 ? 'one leg' : `${finding.pins.length} legs`} of its matrix` : '';
  return `pins ${runtime} ${list(finding.pins)}${pinned}${legs}`;
}

/**
 * The sentence a finding is stated in, with the door it is on.
 *
 * @param {{ name: string }} door
 * @param {object} finding
 */
export function findingSentence(door, finding) {
  if (finding.rule === 'D1' && finding.engineStrict) {
    const more = finding.alsoRefused ? `, and ${finding.alsoRefused} more ${finding.alsoRefused === 1 ? 'package does' : 'packages do'} too` : '';
    return `${door.name} ${pinPhrase(finding, 'Node')} and runs npm ci with engine-strict set in ${finding.engineStrict}; ${finding.package}${finding.version ? ` ${finding.version}` : ''} requires Node ${finding.requires}${more}, so the install refuses.`;
  }
  if (finding.rule === 'D1') {
    const what = `${finding.package}${finding.version ? ` ${finding.version}` : ''}`;
    const says = finding.refuses ? `requires Node ${finding.requires} and refuses to start` : `declares Node ${finding.requires}`;
    return `${door.name} ${pinPhrase(finding, 'Node')} and runs ${finding.tool}; ${what} ${says}.`;
  }
  if (finding.rule === 'D1-python') {
    return `${door.name} ${pinPhrase(finding, 'Python')} and runs ${finding.tool}; ${finding.manifest} requires Python ${finding.requires}.`;
  }
  return '';
}

/** What to do about a finding, naming its source where it has one. */
export function findingRemedy(finding) {
  if (finding.rule === 'D1' && finding.engineStrict) return `pin a Node version every package in the lock accepts, or lift engine-strict in ${finding.engineStrict}`;
  if (finding.rule === 'D1') {
    const source = REFUSES.get(finding.package);
    return `pin a Node version ${finding.package} accepts (${finding.requires}), or use a release of ${finding.package} that accepts ${list(finding.pins)}${source ? `; the start check is in ${source}` : ''}`;
  }
  if (finding.rule === 'D1-python') return `pin a Python version ${finding.manifest} accepts (${finding.requires}), or widen requires-python`;
  return '';
}

/** The error-table code each rule's notice carries. */
export const FINDING_CODES = {
  D1: 'ATLAS_DOOR_TOOLCHAIN',
  'D1-python': 'ATLAS_DOOR_TOOLCHAIN',
};
