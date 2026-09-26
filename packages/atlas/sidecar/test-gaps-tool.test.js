import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * atlas_test_gaps through the official SDK client, which checks every answer
 * against the tool's output schema, on the gaps fixture mapped and
 * committed. Every fact equals one the committed map holds or one the
 * test-gap rules read from it (adapter/test-gaps.js); nothing is invented.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GAPS = resolve(REPO_ROOT, 'fixtures/atlas/gaps');
const scratch = [];
let repo;
let structure;
let client;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

function commitAll(cwd, message) {
  git(cwd, ['add', '-A']);
  git(cwd, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', message]);
}

before(async () => {
  repo = mkdtempSync(join(tmpdir(), 'atlas-test-gaps-'));
  scratch.push(repo);
  cpSync(GAPS, repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  commitAll(repo, 'fixture');
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: repo, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  commitAll(repo, 'map');
  structure = JSON.parse(readFileSync(join(repo, 'atlas', 'structure.json'), 'utf8'));
  client = new Client({ name: 'atlas-test-gaps-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd: repo, stderr: 'pipe' }));
  await client.listTools();
});

after(async () => {
  await client?.close();
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

async function ask(args) {
  const result = await client.callTool({ name: 'atlas_test_gaps', arguments: args });
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
  return result.structuredContent.answer;
}

const factOf = (answer, name) => answer.facts.find((entry) => entry.fact === name);

describe('atlas_test_gaps on the gaps fixture', () => {
  it('is listed, read-only, after atlas_check_change', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    assert.equal(names.indexOf('atlas_test_gaps'), names.indexOf('atlas_check_change') + 1);
    assert.equal(tools.find((tool) => tool.name === 'atlas_test_gaps').annotations.readOnlyHint, true);
  });

  it('answers for the repository with facts the map holds, then suggestions apart', async () => {
    const answer = await ask({});
    assert.deepEqual(answer.found, { kind: 'repository', path: null, part: null });
    const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');
    const runs = factOf(answer, 'testRuns');
    assert.equal(runs.basis, 'declared');
    assert.deepEqual(runs.items, ci.tests.map((run) => ({ workflow: ci.file, ...run })));
    assert.deepEqual(factOf(answer, 'testFilesNoWorkflowRuns').items, structure.testsNotRun);
    const gaps = factOf(answer, 'codeGaps');
    assert.equal(gaps.basis, 'parsed');
    assert.equal(gaps.items[0].path, 'src/format.ts');
    assert.equal(gaps.items.length, 5);
    assert.equal(gaps.total, 7);
    assert.equal(gaps.complete, false);
    const parse = structure.boundaries.flatMap((boundary) => boundary.files).find((file) => file.path === 'src/parse.ts');
    assert.equal(factOf(answer, 'failurePathsNoTestReaches').items.length, parse.failurePaths.length);
    assert.deepEqual(answer.suggestions.map((entry) => entry.rule), ['G6', 'G3', 'G2', 'G4']);
    for (const entry of answer.suggestions) assert.ok(entry.source?.text, JSON.stringify(entry));
  });

  it('answers for a file a test reaches with the reach and its basis', async () => {
    const answer = await ask({ path: 'src/util.ts' });
    assert.deepEqual(answer.found, { kind: 'file', path: 'src/util.ts', part: 'src' });
    const reach = factOf(answer, 'reach');
    assert.equal(reach.basis, 'parsed');
    assert.equal(reach.items[0].kind, 'imports');
    assert.deepEqual(reach.items[0].through, ['src/core.ts']);
    assert.deepEqual(answer.suggestions, []);
  });

  it('answers for a file no test reaches with its failure-path suggestion', async () => {
    const answer = await ask({ path: 'src/parse.ts' });
    assert.equal(factOf(answer, 'reach'), undefined);
    assert.deepEqual(answer.suggestions.map((entry) => `${entry.rule} ${entry.path}`), ['G6 src/parse.ts']);
  });

  it('answers for a part', async () => {
    const answer = await ask({ path: 'tools' });
    assert.deepEqual(answer.found, { kind: 'part', path: null, part: 'tools' });
    assert.deepEqual(answer.suggestions.map((entry) => `${entry.rule} ${entry.part}`), ['G1 tools']);
  });

  it('halts on a path the map holds none of', async () => {
    const result = await client.callTool({ name: 'atlas_test_gaps', arguments: { path: 'nowhere/at-all.ts' } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'ATLAS_GAPS_UNKNOWN_PATH');
  });
});
