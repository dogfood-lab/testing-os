import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mappedRepository } from '../sidecar/test-client.js';
import { assertInventsNothing, committedMap, explainJson } from '../sidecar/test-oracle.js';
import { createTools } from '../sidecar/tools.js';

/**
 * A workflow file explained (docs/atlas-production.spec.md, Part 1 item 5):
 * atlas explain on a workflow prints its door from the map (what starts it,
 * what it runs, reaches and sends, each job with the commands its steps run,
 * the permissions it asks for by name), and never says of a file Atlas does
 * not parse for imports that it imports nothing or that nothing imports it.
 * The runtime of a door (its runner, environment and pinned versions) is a
 * later slice's, and nothing is said of it.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/explain-workflow');
const WORKFLOW = '.github/workflows/release.yml';
let repo;
const tools = createTools();

before(() => {
  repo = mappedRepository(FIXTURE, { prefix: 'atlas-explain-workflow-' });
});

after(async () => {
  await tools.stop();
  if (repo) rmSync(repo, { recursive: true, force: true });
});

function explain(...args) {
  const result = spawnSync(process.execPath, [CLI, 'explain', ...args], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout);
  return result.stdout.trimEnd().split('\n');
}

describe('atlas explain on a workflow file', () => {
  it('prints its door: triggers, what it runs and sends, each job, and permissions by name', () => {
    const lines = explain(WORKFLOW);
    assert.equal(lines[0], '.github/workflows/release.yml is in workflows (config).');
    assert.equal(lines[1], 'It is the door Release.');
    for (const line of [
      'When a tag matching `v*` is pushed; or by hand.',
      'The workflow runs lib/core.test.js and lib/report.js in lib.',
      'It publishes to npm.',
      'Job `test`: the unnamed step 2 runs node, its tests under node --test; the job runs lib/core.test.js.',
      'Job `publish`: "Build the report" runs node; "Publish to npm" runs npm; the job runs lib/report.js.',
      'It asks for the permissions `contents:write` and `id-token:write`.',
    ]) assert.ok(lines.includes(line), `${line}\n--- in ---\n${lines.join('\n')}`);
    assert.ok(!lines.includes('Imports no file in this repository.'));
    assert.ok(!lines.includes('No file imports it.'));
    assert.ok(!lines.some((line) => /ubuntu|runs-on|runner/i.test(line)), 'nothing is said of the runtime yet');
  });

  it('states in --json only what the map records of the door', () => {
    const { door } = explainJson(repo, WORKFLOW);
    const source = JSON.parse(readFileSync(join(repo, 'atlas', 'structure.json'), 'utf8')).doors.find((entry) => entry.file === WORKFLOW);
    assert.deepEqual([door.name, door.file], [source.name, source.file]);
    assert.deepEqual(door.triggers, source.triggers);
    assert.deepEqual(door.permissions, source.permissions);
    assert.deepEqual(door.sends, source.sends);
    assert.deepEqual(door.reach, source.reach);
    assert.deepEqual(door.jobs.map((job) => job.name), ['test', 'publish']);
    for (const job of door.jobs) {
      for (const step of job.steps) {
        assert.ok(source.commands.some((command) => command.job === job.name && command.step === step.step && JSON.stringify(command.programs) === JSON.stringify(step.programs)), JSON.stringify(step));
        for (const test of step.tests ?? []) assert.ok(source.tests.some((entry) => entry.job === job.name && entry.step === step.step && entry.runner === test.runner), JSON.stringify(test));
      }
      for (const run of job.runs) assert.ok(source.runs.some((entry) => entry.job === job.name && entry.path === run.path), JSON.stringify(run));
    }
  });

  it('says nothing of imports for a file Atlas does not parse, and still says it of code', () => {
    const settings = explain('config/settings.yaml');
    assert.ok(!settings.includes('Imports no file in this repository.'), settings.join('\n'));
    assert.ok(!settings.includes('No file imports it.'), settings.join('\n'));
    assert.ok(settings.includes('Read by lib/report.js.'));
    assert.ok(explain('lib/core.js').includes('Imports no file in this repository.'), 'a parsed file that imports nothing is still said to');
  });

  it('reads the programs from the step text a map made before 1.22.0 kept', () => {
    // Such a map kept each step's script where a map made now keeps the
    // programs it runs (adapter/artifact.js stepPrograms).
    const older = mappedRepository(FIXTURE, { prefix: 'atlas-explain-workflow-older-' });
    try {
      const path = join(older, 'atlas', 'structure.json');
      const structure = JSON.parse(readFileSync(path, 'utf8'));
      const door = structure.doors.find((entry) => entry.file === WORKFLOW);
      const texts = { 1: 'node --test lib/core.test.js', 'Build the report': 'node lib/report.js', 'Publish to npm': 'npm publish --provenance' };
      door.commands = door.commands.map(({ programs, ...command }) => ({ ...command, text: texts[command.step] }));
      writeFileSync(path, `${JSON.stringify(structure, null, 2)}\n`);
      const result = spawnSync(process.execPath, [CLI, 'explain', WORKFLOW], { cwd: older, encoding: 'utf8' });
      const lines = result.stdout.trimEnd().split('\n');
      assert.ok(lines.includes('Job `publish`: "Build the report" runs node; "Publish to npm" runs npm; the job runs lib/report.js.'), lines.join('\n'));
      assert.ok(!result.stdout.includes('npm publish --provenance'), 'the script itself is never printed');
    } finally {
      rmSync(older, { recursive: true, force: true });
    }
  });

  it('gives atlas_explain the same door, as a declared fact the map states', async () => {
    const result = await tools.callTool('atlas_explain', { path: WORKFLOW }, { roots: [], cwd: repo });
    assert.notEqual(result.isError, true, result.content[0].text);
    const { answer } = result.structuredContent;
    const [detail] = answer.facts.filter((entry) => entry.fact === 'doorDetail');
    assert.equal(detail.basis, 'declared');
    assertInventsNothing('atlas_explain', answer, committedMap(repo), { explained: explainJson(repo, WORKFLOW) });
    assert.match(result.content[0].text, /Job `publish`: "Build the report" runs node; "Publish to npm" runs npm; the job runs lib\/report\.js\./);
    assert.doesNotMatch(result.content[0].text, /Imports no file in this repository|No file imports it/);
  });
});
