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
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { formatProblem } from './lib/atlas-pin/errors.mjs';
import { EXACT_VERSION } from './lib/atlas-pin/pins.mjs';
import { checkClone } from './lib/atlas-pin/verdict.mjs';

const WORKSPACE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const USAGE = `usage: node scripts/atlas-pin-bump.mjs <check> [options] <clone>...

  check   the pins, the map's engine and a verdict for each clone

A clone is a path to a local clone, on its default branch.

options:
  --version <x.y.z>   the target engine (default ${WORKSPACE_VERSION}, this workspace's version)
  --json              print JSON
`;

const COMMANDS = new Set(['check']);

/**
 * @param {string[]} argv
 * @param {{ write?: (text: string) => void, env?: NodeJS.ProcessEnv }} [io]
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
  return check(args, { write, env });
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

function describe(result, target, write) {
  const heading = { done: `done on ${target}`, ready: `ready to move to ${target}`, person: 'needs a person' }[result.verdict];
  write(`== ${result.repository}: ${heading}\n`);
  for (const pin of result.pins ?? []) {
    write(`   pin  ${pin.file}:${pin.line}  ${pin.form} @dogfood-lab/atlas@${pin.version}${pin.command ? ` ${pin.command}` : ''}\n`);
  }
  if (result.map?.present) write(`   map  ${result.map.engine ? `made by ${result.map.engine}` : 'carries no engine stamp'}\n`);
  for (const each of result.problems) write(formatProblem(each));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
