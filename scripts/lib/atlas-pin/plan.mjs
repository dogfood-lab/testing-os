import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitIn, temporaryClone } from './clone.mjs';
import { tail } from './engine.mjs';
import { problem } from './errors.mjs';
import { rewritePins } from './pins.mjs';
import { STRUCTURE } from './verdict.mjs';

// Diff options fixed here, so a person's diff settings (colour, prefixes,
// external tools, renames) cannot change what the plan shows.
const SETTINGS = ['-c', 'core.quotepath=false', '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'diff.relative=false'];
const DIFF = [...SETTINGS, 'diff', '--cached', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/', '-U3', '--diff-algorithm=myers'];
const NAMES = [...SETTINGS, 'diff', '--cached', '--no-renames', '--name-status', '-z'];

/**
 * The change for a clone that is ready, made in a temporary clone of it and
 * never in the clone itself: every pin rewritten to the target, and the map
 * made again there by the target engine. The change is staged in the
 * temporary clone, so it can be shown as a diff, checked by the same engine,
 * and named by the tree it makes.
 *
 * The caller removes `temp` when it is done with it.
 *
 * @param {string} root
 * @param {{ facts: object, target: string, engine: { label: string, run: Function }, env: NodeJS.ProcessEnv }} options
 * @returns {{ status: 'ready', temp: { dir: string, remove: () => void }, diff: string, changed: Array<{ status: string, path: string }>,
 *   summary: object, notices: string[], tree: string } | { status: 'person', problems: object[] }}
 */
export function planClone(root, { facts, target, engine, env }) {
  const temp = temporaryClone(root, { env });
  if (!temp.ok) return person(problem('PIN_BUMP_FAILED', `git could not clone it into a temporary directory: ${temp.output}`, 'check that git can clone the checkout, then run the tool again'));
  let kept = false;
  try {
    const git = gitIn(temp.dir, env);
    const workflows = [...new Set(facts.pins.map((pin) => pin.file))];
    for (const file of workflows) {
      const path = join(temp.dir, file);
      writeFileSync(path, rewritePins(readFileSync(path, 'utf8'), target));
    }
    const mapped = engine.run('map', temp.dir);
    if (mapped.status !== 0) {
      return person(problem('PIN_BUMP_ENGINE_FAILED', `atlas map (${engine.label}) exited ${mapped.status}:\n${tail(mapped)}`, 'map the repository by hand with the target engine, and read what it says'));
    }
    const made = engineOf(readFileSync(join(temp.dir, STRUCTURE), 'utf8'));
    const staged = git(['add', '-A', '--', 'atlas', ...workflows]);
    if (staged.status !== 0) return person(problem('PIN_BUMP_FAILED', `git add failed in the temporary clone: ${staged.stderr.trim()}`, 'run the tool again; if it repeats, map the repository by hand'));
    const checked = engine.run('check', temp.dir);
    if (checked.status !== 0) {
      return person(problem('PIN_BUMP_ENGINE_FAILED', `atlas check (${engine.label}) failed on the new map, exit ${checked.status}:\n${tail(checked)}`, 'map the repository by hand with the target engine, and read what the check says'));
    }
    const diff = git(DIFF).stdout;
    const changed = nameStatus(git(NAMES).stdout);
    const before = git(['show', `HEAD:${STRUCTURE}`]).stdout;
    const summary = summarize({ facts, target, made, before, after: readFileSync(join(temp.dir, STRUCTURE), 'utf8'), changed });
    const tree = git(['write-tree']).stdout.trim();
    kept = true;
    return { status: 'ready', temp, diff, changed, summary, notices: noticesOf(checked.stdout), tree };
  } finally {
    if (!kept) temp.remove();
  }
}

function person(each) {
  return { status: 'person', problems: [each] };
}

// `git diff --name-status -z` gives status and path as alternate fields.
function nameStatus(text) {
  const fields = text.split('\0').filter((field) => field !== '');
  const out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ status: fields[i], path: fields[i + 1] });
  return out;
}

/**
 * The notices atlas check printed after its verdict, one block for each: the
 * door checks' findings and any engine notice, in the error shape.
 */
export function noticesOf(stdout) {
  const at = stdout.indexOf('\nNotices\n');
  if (at === -1) return [];
  return stdout
    .slice(at + '\nNotices\n'.length)
    .split(/^(?=[A-Z][A-Z0-9_]+ {2})/m)
    .map((block) => block.trimEnd())
    .filter((block) => /^[A-Z][A-Z0-9_]+ {2}/.test(block));
}

/**
 * What the change does to the map, for the pull request: the engine before
 * and after, the doors and parts before and after with those that appear or
 * go, how many doors read differently, and the files of atlas/ that change.
 */
export function summarize({ facts, target, made, before, after, changed }) {
  const old = parse(before);
  const now = parse(after);
  const doors = compare(old?.doors ?? [], now?.doors ?? [], (door) => `${door.kind ?? 'workflow'} "${door.name ?? door.file}" (${door.file})`);
  const parts = compare(old?.boundaries ?? [], now?.boundaries ?? [], (part) => part.name);
  return {
    pins: facts.pins.map(({ file, line, version }) => ({ file, line, from: version, to: target })),
    engine: { before: facts.map.engine, after: made },
    doors,
    parts,
    files: changed.filter((entry) => entry.path.startsWith('atlas/')).map((entry) => entry.path),
  };
}

function compare(before, after, labelOf) {
  const left = new Map(before.map((item) => [labelOf(item), JSON.stringify(item)]));
  const right = new Map(after.map((item) => [labelOf(item), JSON.stringify(item)]));
  return {
    before: before.length,
    after: after.length,
    added: [...right.keys()].filter((key) => !left.has(key)),
    removed: [...left.keys()].filter((key) => !right.has(key)),
    changed: [...right.keys()].filter((key) => left.has(key) && left.get(key) !== right.get(key)).length,
  };
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function engineOf(text) {
  const engine = parse(text)?.engine;
  return typeof engine === 'string' ? engine : null;
}
