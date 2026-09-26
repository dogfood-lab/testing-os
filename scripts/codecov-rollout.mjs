#!/usr/bin/env node
/**
 * codecov-rollout: moves a fleet repository's CI to Codecov recipe v2
 * (scripts/lib/codecov/recipe.mjs), one repository at a time, from a local
 * checkout of each. Atlas reads which step runs the tests and with which
 * runner; the tool edits that step and the workflow as text, and checks its
 * own result against the recipe before it is offered. What it cannot edit
 * safely it leaves to a person, with the reason. See docs/codecov-rollout.md.
 *
 *   check      how each repository's CI differs from recipe v2
 *   plan       the change it would make, as a diff; writes nothing
 *   apply      the change, committed on branch ci/codecov; never pushes
 *   delivered  whether Codecov holds coverage for the default branch
 */
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkRecipe, fileReader, readRecipeFiles } from './lib/codecov/check.mjs';
import { deliveryOf } from './lib/codecov/delivered.mjs';
import { unifiedDiff } from './lib/codecov/diff.mjs';
import { atlasFacts } from './lib/codecov/facts.mjs';
import { planRepository } from './lib/codecov/plan.mjs';
import { BRANCH, TITLE } from './lib/codecov/recipe.mjs';

const USAGE = `usage: node scripts/codecov-rollout.mjs <check|plan|apply|delivered> [options] <repository>...

  check      how each repository's CI differs from Codecov recipe v2
  plan       the change the tool would make, as a diff; writes nothing
  apply      make the change and commit it on branch ${BRANCH}; never pushes
  delivered  whether Codecov holds coverage for the default branch
             (a checkout, or owner/name; behind a proxy, set NODE_USE_ENV_PROXY=1)

A repository is a path to a local checkout.

options:
  --step workflow:job:step   the test step to carry the reports (plan, apply)
  --trailer "Key: value"     a trailer for apply's commit message; repeatable
  --json                     print JSON (check, plan)
`;

const COMMANDS = new Set(['check', 'plan', 'apply', 'delivered']);

/**
 * @param {string[]} argv
 * @param {{ write?: (text: string) => void, exec?: Function, fetch?: Function }} [io]
 * @returns {Promise<number>} 0 when every repository is done or delivered, 1 when one is not, 2 on a usage error
 */
export async function main(argv, io = {}) {
  const write = io.write ?? ((text) => process.stdout.write(text));
  const exec = io.exec ?? runCommand;
  const args = parseArgs(argv);
  if (args.error) {
    write(`codecov-rollout: ${args.error}\n${USAGE}`);
    return 2;
  }
  if (args.command === 'check') return check(args, write);
  if (args.command === 'plan') return plan(args, write);
  if (args.command === 'apply') return apply(args, write, exec);
  return delivered(args, write, io.fetch ?? globalThis.fetch);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command == null) return { error: 'name a command' };
  if (!COMMANDS.has(command)) return { error: `unknown command ${command}` };
  const args = { command, json: false, step: null, trailers: [], targets: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const word = rest[i];
    if (word === '--json') args.json = true;
    else if (word === '--step' || word === '--trailer') {
      const value = rest[i + 1];
      if (value == null || value.startsWith('--')) return { error: `${word} needs a value` };
      if (word === '--step') args.step = value;
      else args.trailers.push(value);
      i += 1;
    } else if (word.startsWith('--')) return { error: `unknown option ${word}` };
    else args.targets.push(word);
  }
  if (args.targets.length === 0) return { error: `${command} needs at least one repository` };
  return args;
}

function check({ targets, json }, write) {
  const results = targets.map((root) => ({ repository: root, ...checkRecipe(readRecipeFiles(root)) }));
  if (json) write(`${JSON.stringify(results, null, 2)}\n`);
  else {
    for (const { repository, problems, notes } of results) {
      write(`== ${repository}: ${problems.length === 0 ? 'matches recipe v2' : `${problems.length} difference${problems.length === 1 ? '' : 's'}`}\n`);
      for (const problem of problems) write(`   - ${problem}\n`);
      for (const note of notes) write(`   . ${note}\n`);
    }
  }
  return results.some((result) => result.problems.length > 0) ? 1 : 0;
}

function planFor(root, step) {
  return { repository: root, ...planRepository({ files: readRecipeFiles(root), read: fileReader(root), facts: atlasFacts(root), step }) };
}

function describe(plan, write) {
  if (plan.status === 'done') {
    write(`== ${plan.repository}: already on recipe v2\n`);
    return;
  }
  if (plan.status === 'hand') {
    write(`== ${plan.repository}: needs a person\n`);
    for (const reason of plan.reasons) write(`   ! ${reason}\n`);
    return;
  }
  const { workflow, job, step, runner } = plan.target;
  write(`== ${plan.repository}: ready: ${workflow.replace(/^\.github\/workflows\//, '')} job ${job}, ${/^\d+$/.test(step) ? `step ${step}` : `step "${step}"`} (${runner})\n`);
  for (const change of plan.changes) write(`   - ${change}\n`);
  if (plan.atlas.version) write(`   . apply runs @dogfood-lab/atlas@${plan.atlas.version} check, as CI does, and maps again if it fails\n`);
  else if (plan.atlas.remap) write('   . codecov.yml falls in no Atlas part and no workflow pins Atlas: map the repository again by hand\n');
}

function plan({ targets, json, step }, write) {
  const plans = targets.map((root) => planFor(root, step));
  if (json) write(`${JSON.stringify(plans, null, 2)}\n`);
  else {
    for (const each of plans) {
      describe(each, write);
      for (const file of each.files) write(unifiedDiff(file.before, file.after, file.path));
    }
  }
  return plans.some((each) => each.status === 'hand') ? 1 : 0;
}

function apply({ targets, step, trailers }, write, exec) {
  let code = 0;
  for (const root of targets) {
    const git = (args, options = {}) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', ...options });
    const status = git(['status', '--porcelain']);
    if (status.status !== 0) {
      write(`== ${root}: not applied: not a git checkout\n`);
      code = 1;
      continue;
    }
    if (status.stdout.trim() !== '') {
      write(`== ${root}: not applied: the working tree has uncommitted changes\n`);
      code = 1;
      continue;
    }
    const each = planFor(root, step);
    describe(each, write);
    if (each.status === 'hand') code = 1;
    if (each.status !== 'ready') continue;
    const branch = git(['switch', '-c', BRANCH]);
    if (branch.status !== 0) {
      write(`   not applied: could not make branch ${BRANCH} (${branch.stderr.trim()})\n`);
      code = 1;
      continue;
    }
    for (const file of each.files) writeFileSync(join(root, file.path), file.after);
    git(['add', '--', ...each.files.map((file) => file.path)]);
    if (each.atlas.version) {
      const atlas = `@dogfood-lab/atlas@${each.atlas.version}`;
      if (exec('npx', ['--yes', atlas, 'check'], root).status !== 0) {
        const mapped = exec('npx', ['--yes', atlas, 'map'], root);
        if (mapped.status !== 0) {
          write(`   not committed: ${atlas} check failed and map failed too; the change is staged on ${BRANCH}\n${mapped.output}`);
          code = 1;
          continue;
        }
        git(['add', '--', 'atlas']);
        write(`   . ${atlas} check failed on the change, so the map was made again and joins the commit\n`);
      }
    }
    const left = checkRecipe(readRecipeFiles(root)).problems;
    if (left.length > 0) {
      write(`   not committed: the checkout still differs from recipe v2:\n${left.map((problem) => `   - ${problem}\n`).join('')}`);
      code = 1;
      continue;
    }
    const body = ['Moves CI to Codecov recipe v2:', ...each.changes.map((change) => `- ${change}`)].join('\n');
    const message = [TITLE, body, ...(trailers.length > 0 ? [trailers.join('\n')] : [])].join('\n\n');
    const commit = git(['commit', '-q', '-F', '-'], { input: message });
    if (commit.status !== 0) {
      write(`   not committed: git commit failed (${commit.stderr.trim()})\n`);
      code = 1;
      continue;
    }
    const slug = slugOf(root);
    const bodyFile = join(root, '.git', 'codecov-rollout-pr.md');
    writeFileSync(bodyFile, `${body}\n\nMade with scripts/codecov-rollout.mjs (dogfood-lab/testing-os). Delivery is confirmed after the first upload from the default branch: node scripts/codecov-rollout.mjs delivered ${slug ?? '<owner/name>'}\n`);
    write(`   committed on ${BRANCH}; next:\n   git -C ${quote(root)} push -u origin ${BRANCH}\n`);
    if (slug) write(`   gh pr create --repo ${slug} --head ${BRANCH} --draft --title "${TITLE}" --body-file ${quote(bodyFile)}\n`);
  }
  return code;
}

async function delivered({ targets }, write, fetch) {
  let code = 0;
  for (const target of targets) {
    const repository = repositoryOf(target);
    if (repository == null) {
      write(`== ${target}: not a checkout with a GitHub origin, nor owner/name\n`);
      code = 1;
      continue;
    }
    const { delivered: ok, line } = await deliveryOf(repository, fetch);
    write(`== ${repository.slug}: ${line}\n`);
    if (!ok) code = 1;
  }
  return code;
}

// A checkout's GitHub owner/name and default branch, or owner/name as given.
function repositoryOf(target) {
  if (existsSync(target) && statSync(target).isDirectory()) {
    const slug = slugOf(target);
    if (slug == null) return null;
    const head = spawnSync('git', ['-C', target, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8' });
    return { slug, defaultBranch: head.status === 0 ? head.stdout.trim().replace(/^origin\//, '') : null };
  }
  return /^[\w.-]+\/[\w.-]+$/.test(target) ? { slug: target, defaultBranch: null } : null;
}

function slugOf(root) {
  const origin = spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (origin.status !== 0) return null;
  const match = /([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(origin.stdout.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

function quote(path) {
  return /^[\w./:@-]+$/.test(path) ? path : `"${path}"`;
}

// npx is a .cmd script on Windows, which Node starts only through a shell.
function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
