import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gitIn, temporaryClone } from './clone.mjs';
import { tail } from './engine.mjs';
import { problem } from './errors.mjs';
import { rewritePins } from './pins.mjs';
import { planClone } from './plan.mjs';
import { checkClone, factsAt } from './verdict.mjs';

export const branchFor = (target) => `atlas/pin-${target}`;
export const titleFor = (target) => `Pin Atlas ${target} and make the map again`;

/**
 * The planned change, committed in the clone on branch atlas/pin-<target>
 * from the default branch, which stays where it was; nothing is pushed. The
 * commit uses the clone's own git identity, and none is ever invented. The
 * committed tree must be the tree the plan staged, and a clean clone of the
 * branch must pass atlas check at the target, or the clone goes to a person
 * with the branch left for them to read.
 *
 * @param {string} root
 * @param {{ target: string, engine: { label: string, run: Function }, env: NodeJS.ProcessEnv, trailers: string[] }} options
 */
export function applyClone(root, { target, engine, env, trailers }) {
  const facts = checkClone(root, { target, env });
  const branch = branchFor(target);
  if (facts.verdict === 'done') return { ...facts, outcome: 'done' };
  if (facts.verdict === 'person') return { ...facts, outcome: 'person' };
  const git = gitIn(root, env);

  if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) {
    const there = factsAt(root, branch, env);
    const made = there != null && there.pins.length > 0 && there.others.length === 0 && there.pins.every((pin) => pin.version === target) && there.map.engine === target;
    const current = made && git(['merge-base', '--is-ancestor', 'HEAD', branch]).status === 0;
    if (!current) {
      const why = made ? `${branch} was made from an older commit of ${facts.defaultBranch}` : `${branch} does not hold every pin at ${target} and a map made by it`;
      return person(facts, problem('PIN_BUMP_BRANCH_EXISTS', why, `read it (git log ${facts.defaultBranch}..${branch}); delete it with git branch -D ${branch} to have the tool make it again`));
    }
    const commit = git(['rev-parse', '--short', branch]).stdout.trim();
    return withProof({ ...facts, outcome: 'already', branch, commit }, root, { branch, engine, env });
  }

  for (const variable of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) {
    if (git(['-c', 'user.useConfigOnly=true', 'var', variable]).status !== 0) {
      return person(facts, problem('PIN_BUMP_NO_IDENTITY', `git has no ${variable === 'GIT_AUTHOR_IDENT' ? 'author' : 'committer'} identity configured for this clone`, 'set user.name and user.email for this clone (git config user.name ...), then run apply again; the tool does not invent one'));
    }
  }

  const planned = planClone(root, { facts, target, engine, env });
  if (planned.status !== 'ready') return { ...facts, verdict: 'person', outcome: 'person', problems: planned.problems };
  const { temp, changed, tree, summary, notices } = planned;
  const change = { summary, notices, branch };
  try {
    const made = git(['switch', '-q', '-c', branch]);
    if (made.status !== 0) return person(facts, problem('PIN_BUMP_FAILED', `git could not make branch ${branch}: ${made.stderr.trim()}`, 'read what git says, then run apply again'), change);
    const workflows = new Set(facts.pins.map((pin) => pin.file));
    for (const { status, path } of changed) {
      const file = join(root, path);
      if (status === 'D') git(['rm', '-q', '--', path]);
      else if (workflows.has(path)) writeFileSync(file, rewritePins(readFileSync(file, 'utf8'), target));
      else {
        mkdirSync(dirname(file), { recursive: true });
        copyFileSync(join(temp.dir, path), file);
      }
    }
    const staged = git(['add', '-A', '--', ...changed.map((entry) => entry.path)]);
    const committed = staged.status === 0 ? git(['-c', 'user.useConfigOnly=true', 'commit', '-q', '-F', '-'], { input: messageFor(target, summary, trailers) }) : staged;
    if (committed.status !== 0) {
      return person(facts, problem('PIN_BUMP_COMMIT_FAILED', `git did not commit (${committed.stderr.trim()}); the change is staged on ${branch}`, `read what git says; the clone is left on ${branch} with the change staged`), change);
    }
    const commit = git(['rev-parse', '--short', 'HEAD']).stdout.trim();
    const holds = git(['rev-parse', 'HEAD^{tree}']).stdout.trim();
    git(['switch', '-q', facts.defaultBranch]);
    if (holds !== tree) {
      return person(facts, problem('PIN_BUMP_COMMIT_DIFFERS', `the commit ${commit} on ${branch} holds tree ${holds.slice(0, 12)}, and the plan made ${tree.slice(0, 12)}`, `compare them (git diff ${facts.defaultBranch} ${branch}); a hook or a line-ending setting in the clone may have changed a file`), { ...change, commit });
    }
    return withProof({ ...facts, outcome: 'applied', commit, ...change }, root, { branch, engine, env });
  } finally {
    temp.remove();
  }
}

/**
 * The proof: a clean clone of the branch, taken with --no-local as CI's
 * checkout would take it, and the target engine's check run there. Anything
 * but exit 0 sends the clone to a person, with the branch left.
 */
function withProof(result, root, { branch, engine, env }) {
  const clone = temporaryClone(root, { branch, env });
  if (!clone.ok) return person(result, problem('PIN_BUMP_FAILED', `git could not clone ${branch} for the proof: ${clone.output}`, `check that git can clone the checkout; ${branch} is left for you to read`));
  try {
    const checked = engine.run('check', clone.dir);
    const proof = { status: checked.status, engine: engine.label };
    if (checked.status !== 0) {
      return { ...person(result, problem('PIN_BUMP_PROOF_FAILED', `atlas check (${engine.label}) on a clean clone of ${branch} exited ${checked.status}:\n${tail(checked)}`, `read ${branch}; it is left in the clone, unpushed`)), proof };
    }
    return { ...result, proof };
  } finally {
    clone.remove();
  }
}

function person(result, each, extra = {}) {
  return { ...result, ...extra, verdict: 'person', outcome: 'person', problems: [...(result.problems ?? []), each] };
}

/** The commit message, and the body a pull request can carry. */
export function messageFor(target, summary, trailers = []) {
  const from = [...new Set(summary.pins.map((pin) => pin.from))].join(', ');
  const body = [
    `Moves the Atlas pin from ${from} to ${target} and makes the map again`,
    'with that engine, in one change, as the org rule asks: one Atlas',
    'version across the fleet, moved by pull request.',
    '',
    ...summary.pins.map((pin) => `- ${pin.file}:${pin.line}: ${pin.from} -> ${pin.to}`),
    `- atlas/ made by ${summary.engine.after} (was ${summary.engine.before ?? 'no engine stamp'}): ${summary.files.map((path) => path.replace(/^atlas\//, '')).join(', ')}`,
  ].join('\n');
  return `${[titleFor(target), body, ...(trailers.length > 0 ? [trailers.join('\n')] : [])].join('\n\n')}\n`;
}
