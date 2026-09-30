import { cloneState, treeAt } from './clone.mjs';
import { problem } from './errors.mjs';
import { compareVersions, findPins } from './pins.mjs';

export const WORKFLOWS = '.github/workflows/';
export const STRUCTURE = 'atlas/structure.json';

/**
 * What a ref of a clone holds, for the pin: every pin with its file, line,
 * form and version; the uses of Atlas the tool does not move; whether a
 * workflow runs atlas check; and the engine that made the committed map.
 *
 * @returns {{ pins: object[], others: object[], checkSteps: Array<{ file: string, line: number }>,
 *   map: { present: boolean, engine: string | null } } | null} null when the ref names nothing
 */
export function factsAt(root, ref, env) {
  const tree = treeAt(root, ref, env);
  if (tree == null) return null;
  const workflows = tree.paths.filter((path) => path.startsWith(WORKFLOWS)).map((path) => ({ path, text: tree.read(path) ?? '' }));
  const { pins, others } = findPins(workflows);
  const checkSteps = [...pins.filter((pin) => pin.command === 'check'), ...others.filter((other) => other.check)].map(({ file, line }) => ({ file, line }));
  const present = tree.paths.includes(STRUCTURE);
  return { pins, others, checkSteps, map: { present, engine: present ? engineOf(tree.read(STRUCTURE)) : null } };
}

/**
 * The verdict on one clone at its checked-out commit: `done` when every pin is
 * the target and the map was made by it, `ready` when the tool can make the
 * change, `person` with each reason otherwise.
 *
 * @param {string} root
 * @param {{ target: string, env: NodeJS.ProcessEnv }} options
 */
export function checkClone(root, { target, env }) {
  const state = cloneState(root, env);
  if (!state.isClone) {
    return { repository: root, verdict: 'person', problems: [problem('PIN_BUMP_NOT_A_CLONE', `${root} is not the top of a git checkout`, 'pass the directory a clone was made into')] };
  }
  const facts = factsAt(root, 'HEAD', env);
  if (facts == null) {
    return { repository: root, verdict: 'person', problems: [problem('PIN_BUMP_NOT_A_CLONE', `${root} has no commit checked out`, 'pass a clone of a repository with history')] };
  }
  const problems = [];
  // The map's statistics (commits per file, co-change, the floor) are read
  // from history, so a map made from a shallow clone would replace the
  // committed ones with what a handful of commits say.
  if (state.shallow) {
    problems.push(problem('PIN_BUMP_SHALLOW_CLONE', `the clone is shallow, so a map made from it would read ${state.commits} commit${state.commits === 1 ? '' : 's'} of history`, `git -C ${root} fetch --unshallow, then run the tool again`));
  }
  if (state.dirty) problems.push(problem('PIN_BUMP_DIRTY_TREE', 'git status lists changes or untracked files', 'commit, stash or remove them, then run the tool again'));
  if (state.defaultBranch == null) {
    problems.push(problem('PIN_BUMP_NO_DEFAULT_BRANCH', 'refs/remotes/origin/HEAD is not set', 'run git remote set-head origin --auto, or clone the repository again'));
  } else if (state.branch !== state.defaultBranch) {
    problems.push(problem('PIN_BUMP_NOT_DEFAULT_BRANCH', `the clone is on ${state.branch ?? 'a detached HEAD'}, and the default branch is ${state.defaultBranch}`, `git switch ${state.defaultBranch}, then run the tool again`));
  }
  if (!facts.map.present) problems.push(problem('PIN_BUMP_NO_MAP', `${STRUCTURE} is not committed`, 'map the repository first (atlas init, atlas map, commit atlas/); this tool only moves a map that exists'));
  if (facts.checkSteps.length === 0) problems.push(problem('PIN_BUMP_NO_CHECK_STEP', 'no workflow step runs atlas check', 'add an atlas check step to a push-triggered workflow by hand; the org rule counts it, and this tool does not add one'));
  for (const other of facts.others) {
    problems.push(problem('PIN_BUMP_UNREADABLE_FORM', `${other.file}:${other.line}: ${other.why}: ${other.text}`, 'move this use by hand, or pin it as npx --yes @dogfood-lab/atlas@<version>'));
  }
  for (const pin of facts.pins) {
    if (compareVersions(pin.version, target) > 0) problems.push(problem('PIN_BUMP_NEWER_PIN', `${pin.file}:${pin.line} pins ${pin.version}, newer than the target ${target}`, 'pass --version with the fleet\'s version; this tool never moves a pin back'));
  }
  const engine = facts.map.engine;
  if (engine != null && compareVersions(engine, target) > 0) problems.push(problem('PIN_BUMP_NEWER_MAP', `the map was made by ${engine}, newer than the target ${target}`, 'pass --version with the fleet\'s version; this tool never makes a map with an older engine'));
  const done = facts.pins.length > 0 && facts.pins.every((pin) => pin.version === target) && engine === target;
  const verdict = problems.length > 0 ? 'person' : done ? 'done' : 'ready';
  return { repository: root, verdict, problems, defaultBranch: state.defaultBranch, ...facts };
}

// The engine a map records, or null for a map with no stamp (every map made
// before 1.23.0) or one that cannot be read.
function engineOf(text) {
  try {
    const engine = JSON.parse(text ?? '').engine;
    return typeof engine === 'string' && /^\d+\.\d+\.\d+$/.test(engine) ? engine : null;
  } catch {
    return null;
  }
}
