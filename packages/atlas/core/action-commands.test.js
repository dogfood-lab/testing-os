import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { parse } from 'yaml';
import { buildArtifact } from '../adapter/artifact.js';
import { findingLines } from '../adapter/page.js';
import { makeRepo } from './fixture-repo.js';
import { mapRepository } from './index.js';

/**
 * A program run through an action input (docs/atlas-production.spec.md,
 * Part 6). A step that uses a known wrapper action (nick-fields/retry,
 * Wandalen/wretry.action) and hands it a command is read as a step that runs
 * that command, in the directory the action runs it in: the workspace, since
 * a job's defaults.run applies to run steps alone. D1 and the map see what
 * it runs. A command-shaped input of any other action, or one the wrapper
 * runs apart from its command, is listed on the door as unresolved with why,
 * never taken as a run (fixtures/atlas/action-commands).
 */

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/action-commands');
const root = makeRepo(FIXTURE);
after(() => rmSync(root, { recursive: true, force: true }));

const mapped = mapRepository({
  repoPath: root,
  boundaries: parse(readFileSync(join(FIXTURE, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries.map(({ name, globs, role }) => ({ name, globs, role })),
});
const door = mapped.doors.find((entry) => entry.file === '.github/workflows/sync.yml');

describe('a command a wrapper action is handed', () => {
  it('is a run of the file it names, from the workspace and not the job\'s run directory', () => {
    assert.deepEqual(door.runs.map((run) => [run.path, run.job]), [['scripts/sync.js', 'sync']]);
    assert.deepEqual(door.reach.map((entry) => [entry.boundary, entry.depth]), [['scripts', 0], ['lib', 1]]);
  });

  it('is the step\'s command, as a run step\'s script is', () => {
    assert.deepEqual(door.commands.map((command) => [command.step, command.text]), [
      ['Install', 'npm ci'],
      ['Sync', 'node scripts/sync.js'],
      ['Build', 'npm run build'],
    ]);
  });

  it('is judged by D1: the build a retry wrapper runs reaches astro, which the Node 20 pin fails', () => {
    assert.deepEqual(door.findings, [{
      rule: 'D1',
      job: 'sync',
      step: 'Build',
      tool: 'astro build',
      package: 'astro',
      version: '7.3.3',
      requires: '>=22.12.0',
      pins: ['20'],
      pinnedBy: { step: 'Setup Node', version: '20' },
      refuses: true,
      lines: [
        { file: '.github/workflows/sync.yml', line: 14 },
        { file: '.github/workflows/sync.yml', line: 31 },
        { file: 'package-lock.json', line: 9 },
      ],
    }]);
  });
});

describe('a command-shaped input Atlas does not read as the step\'s command', () => {
  // In the workflow's order, a step's inputs by name.
  const expected = [
    { job: 'sync', step: 'Sync', action: 'nick-fields/retry', input: 'on_retry_command', program: 'node', why: 'the action runs that input apart from its command, and Atlas reads only the command' },
    { job: 'sync', step: 'Report', action: 'acme/report-action', input: 'run-command', program: 'node', why: 'Atlas does not know the action to run its inputs as commands' },
    { job: 'sync', step: 'Sync on Windows shell', action: 'nick-fields/retry', input: 'command', program: 'node', why: 'the action runs it with pwsh, a shell Atlas does not read' },
  ];

  it('is listed on the door, unresolved with why, never a run', () => {
    assert.deepEqual(door.unresolvedCommands, expected);
    assert.ok(!door.runs.some((run) => run.path === 'scripts/report.js'));
  });

  it('leaves a value that is only a program\'s name alone (cache: npm)', () => {
    assert.ok(!door.unresolvedCommands.some((entry) => entry.input === 'cache'));
  });

  it('is carried into the map and stated where the door is explained', () => {
    const carried = buildArtifact(mapped, '0'.repeat(40)).doors.find((entry) => entry.file === '.github/workflows/sync.yml');
    assert.deepEqual(carried.unresolvedCommands, expected);
    const lines = findingLines(carried);
    assert.ok(lines.includes('Not read as a command: in job `sync`, "Report", the input `run-command` of acme/report-action starts node, since Atlas does not know the action to run its inputs as commands.'), lines.join('\n'));
  });
});
