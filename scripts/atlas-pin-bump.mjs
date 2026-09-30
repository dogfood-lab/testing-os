#!/usr/bin/env node
/**
 * atlas-pin-bump: moves a fleet repository to one Atlas engine, one
 * repository at a time, from a local clone of each: every pin of
 * @dogfood-lab/atlas in its workflows, and the map made again by that engine,
 * in one change (the org rule in .claude/rules/atlas-map.md; Part 7 of
 * docs/atlas-production.spec.md). What it cannot move safely it leaves to a
 * person, with the reason.
 *
 *   check   the pins, the map's engine and a verdict for each clone
 *   plan    the change as a diff, made in a temporary clone; writes nothing
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { commandRunner, engineRunner } from './lib/atlas-pin/engine.mjs';
import { formatProblem } from './lib/atlas-pin/errors.mjs';
import { EXACT_VERSION } from './lib/atlas-pin/pins.mjs';
import { planClone } from './lib/atlas-pin/plan.mjs';
import { checkClone } from './lib/atlas-pin/verdict.mjs';

const WORKSPACE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const USAGE = `usage: node scripts/atlas-pin-bump.mjs <check|plan> [options] <clone>...

  check   the pins, the map's engine and a verdict for each clone
  plan    the change as a unified diff, with a summary of the map's change and
          the notices atlas check prints on it; writes nothing to the clone

A clone is a path to a local clone, on its default branch.

options:
  --version <x.y.z>   the target engine (default ${WORKSPACE_VERSION}, this workspace's version)
  --json              print JSON
`;

const COMMANDS = new Set(['check', 'plan']);

/**
 * @param {string[]} argv
 * @param {{ write?: (text: string) => void, exec?: Function, env?: NodeJS.ProcessEnv }} [io]
 * @returns {Promise<number>} 0 when every clone is done or ready, 1 when one needs a person, 2 on a usage error
 */
export async function main(argv, io = {}) {
  const write = io.write ?? ((text) => process.stdout.write(text));
  const env = io.env ?? process.env;
  const args = parseArgs(argv);
  if (args.error) {
    write(`atlas-pin-bump: ${args.error}\n${USAGE}`);
    return 2;
  }
  const engine = engineRunner({ version: args.version, exec: io.exec ?? commandRunner(env) });
  const context = { write, env, engine };
  if (args.command === 'check') return check(args, context);
  return plan(args, context);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command == null) return { error: 'name a command' };
  if (!COMMANDS.has(command)) return { error: `unknown command ${command}` };
  const args = { command, json: false, version: WORKSPACE_VERSION, targets: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const word = rest[i];
    if (word === '--json') args.json = true;
    else if (word === '--version') {
      const value = rest[i + 1];
      if (value == null || value.startsWith('--')) return { error: `${word} needs a value` };
      if (!EXACT_VERSION.test(value)) return { error: `--version ${value} is not an exact version such as 1.24.0` };
      args.version = value;
      i += 1;
    } else if (word.startsWith('--')) return { error: `unknown option ${word}` };
    else args.targets.push(word);
  }
  if (args.targets.length === 0) return { error: `${command} needs at least one clone` };
  return args;
}

function check({ targets, json, version }, { write, env }) {
  const results = targets.map((root) => checkClone(root, { target: version, env }));
  if (json) write(`${JSON.stringify(results.map((result) => ({ ...result, target: version })), null, 2)}\n`);
  else for (const result of results) describe(result, version, write);
  return results.some((result) => result.verdict === 'person') ? 1 : 0;
}

function plan({ targets, json, version }, { write, env, engine }) {
  const plans = targets.map((root) => planFor(root, { target: version, env, engine }));
  if (json) write(`${JSON.stringify(plans, null, 2)}\n`);
  else {
    for (const each of plans) {
      describe(each, version, write);
      if (each.verdict !== 'ready') continue;
      write(each.diff);
      writeSummary(each, version, write);
    }
  }
  return plans.some((each) => each.verdict === 'person') ? 1 : 0;
}

// A clone's verdict, and for one that is ready, the change made in a
// temporary clone. The temporary clone is removed before this returns.
function planFor(root, { target, env, engine }) {
  const facts = checkClone(root, { target, env });
  if (facts.verdict !== 'ready') return { ...facts, target };
  const made = planClone(root, { facts, target, engine, env });
  if (made.status !== 'ready') return { ...facts, target, verdict: 'person', problems: made.problems };
  made.temp.remove();
  const { temp, status, ...change } = made;
  return { ...facts, target, ...change };
}

function describe(result, target, write) {
  const heading = { done: `done on ${target}`, ready: `ready to move to ${target}`, person: 'needs a person' }[result.verdict];
  write(`== ${result.repository}: ${heading}\n`);
  for (const pin of result.pins ?? []) {
    write(`   pin  ${pin.file}:${pin.line}  ${pin.form} @dogfood-lab/atlas@${pin.version}${pin.command ? ` ${pin.command}` : ''}\n`);
  }
  if (result.map?.present) write(`   map  ${result.map.engine ? `made by ${result.map.engine}` : 'carries no engine stamp'}\n`);
  for (const each of result.problems) write(formatProblem(each));
}

function writeSummary({ summary, notices }, target, write) {
  const { engine, doors, parts, files } = summary;
  write('-- summary\n');
  for (const pin of summary.pins) write(`   pin    ${pin.file}:${pin.line}  ${pin.from} -> ${pin.to}\n`);
  write(`   map    ${engine.before ? `made by ${engine.before}` : 'no engine stamp'} -> made by ${engine.after ?? 'no engine stamp'}\n`);
  write(`   doors  ${counted(doors)}\n`);
  write(`   parts  ${counted(parts)}\n`);
  write(`   files  ${files.length > 0 ? files.join(', ') : 'none of atlas/ changes'}\n`);
  write(`-- notices from atlas check at ${target}: ${notices.length === 0 ? 'none' : notices.length}\n`);
  for (const notice of notices) write(`${notice.replace(/^/gm, '   ')}\n`);
}

function counted({ before, after, added, removed, changed }) {
  const parts = [`${before} -> ${after}`];
  if (added.length > 0) parts.push(`new: ${added.join(', ')}`);
  if (removed.length > 0) parts.push(`gone: ${removed.join(', ')}`);
  if (changed != null && changed > 0) parts.push(`${changed} read differently`);
  return parts.join('; ');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
