import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { assertInventsNothing, committedMap, explainJson } from './test-oracle.js';

/**
 * The four tools that answer from the committed map, called through the
 * official SDK client (which checks each answer against the tool's output
 * schema), on a fixture and on this repository. Every fact in every answer
 * must equal a fact in the committed map or in explain --json. atlas_reach
 * follows parsed and declared edges as far as they go and lists a text-found
 * reader one step out without following it.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-reach');
const ON_MAP = ['atlas_reach', 'atlas_explain', 'atlas_overview', 'atlas_changes'];
const scratch = [];
let repo;
let firstMap;

function git(cwd, args) {
  // This repository's map is a few megabytes, past spawnSync's default buffer.
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || String(result.error ?? '')}`);
  return result.stdout.trim();
}

function commitAll(cwd, message) {
  git(cwd, ['add', '-A']);
  git(cwd, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', message]);
}

function map(cwd) {
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
}

// The fixture with a history in which lib/core.js and lib/other.js change
// together, mapped and committed twice: once as it is, and once after
// tools/report.js starts importing lib/other.js and a new part appears.
before(() => {
  repo = mkdtempSync(join(tmpdir(), 'atlas-tools-'));
  scratch.push(repo);
  cpSync(FIXTURE, repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  commitAll(repo, 'fixture');
  for (let i = 1; i <= 6; i += 1) {
    appendFileSync(join(repo, 'lib', 'core.js'), `// change ${i}\n`);
    appendFileSync(join(repo, 'lib', 'other.js'), `// change ${i}\n`);
    commitAll(repo, `change ${i}`);
  }
  map(repo);
  commitAll(repo, 'map');
  firstMap = git(repo, ['rev-parse', 'HEAD']);
  writeFileSync(join(repo, 'tools', 'report.js'), "import { readFileSync } from 'node:fs';\nimport { label } from '../lib/other.js';\n\nexport function report() {\n  return label(JSON.parse(readFileSync('data/state.json', 'utf8')));\n}\n");
  commitAll(repo, 'report labels the state');
  map(repo);
  commitAll(repo, 'map again');
});

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

async function connect(cwd) {
  const client = new Client({ name: 'atlas-tools-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd, stderr: 'pipe' }));
  await client.listTools();
  return client;
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
  assert.equal(result.content.length, 1);
  return result.structuredContent;
}

function groups(answer, fact, filter = {}) {
  return answer.facts.filter((entry) => entry.fact === fact
    && (filter.basis == null || entry.basis === filter.basis)
    && (filter.tests == null || (entry.tests === true) === filter.tests));
}

function items(answer, fact, filter) {
  return groups(answer, fact, filter).flatMap((entry) => entry.items);
}

describe('the tools on the committed map', () => {
  it('are listed in the order the questions are asked, reach first', async () => {
    const client = await connect(repo);
    try {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((tool) => tool.name).filter((name) => ON_MAP.includes(name)), ON_MAP);
    } finally {
      await client.close();
    }
  });

  it('answer on a fixture, and every fact equals a fact in the committed map or explain --json', async () => {
    const client = await connect(repo);
    const source = committedMap(repo);
    try {
      for (const path of ['lib/core.js', 'data', 'tools', 'app/main.test.js']) {
        const { answer } = await call(client, 'atlas_explain', { path });
        assertInventsNothing('atlas_explain', answer, source, { explained: explainJson(repo, path) });
      }
      assertInventsNothing('atlas_overview', (await call(client, 'atlas_overview', {})).answer, source);
      assertInventsNothing('atlas_reach', (await call(client, 'atlas_reach', { paths: ['lib/core.js', 'lib/other.js'] })).answer, source);
      const base = JSON.parse(git(repo, ['show', `${firstMap}:atlas/structure.json`]));
      const changes = await call(client, 'atlas_changes', { since: firstMap });
      assertInventsNothing('atlas_changes', changes.answer, source, { base });
      assert.deepEqual(items(changes.answer, 'import-added').map((item) => item.sentence), ['tools now imports lib.']);
    } finally {
      await client.close();
    }
  });

  it('answer on this repository from its committed map', async (t) => {
    const shallow = git(REPO_ROOT, ['rev-parse', '--is-shallow-repository']) === 'true';
    const source = committedMap(REPO_ROOT);
    const commit = source.structure.generatedFrom.commit;
    const held = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: REPO_ROOT }).status === 0;
    if (shallow && !held) {
      t.skip('this shallow clone does not hold the commit the committed map was made from, so the sidecar halts, as it must');
      return;
    }
    const client = await connect(REPO_ROOT);
    try {
      const path = 'packages/ingest/persist.js';
      assertInventsNothing('atlas_explain', (await call(client, 'atlas_explain', { path })).answer, source, { explained: explainJson(REPO_ROOT, path) });
      assertInventsNothing('atlas_overview', (await call(client, 'atlas_overview', {})).answer, source);
      assertInventsNothing('atlas_reach', (await call(client, 'atlas_reach', { paths: ['packages/verify/index.js'] })).answer, source);
      const earlier = git(REPO_ROOT, ['log', '--format=%H', '-n', '2', '--', 'atlas/structure.json']).split('\n')[1];
      if (earlier) {
        const base = JSON.parse(git(REPO_ROOT, ['show', `${earlier}:atlas/structure.json`]));
        assertInventsNothing('atlas_changes', (await call(client, 'atlas_changes', { since: earlier })).answer, source, { base });
      }
    } finally {
      await client.close();
    }
  });
});

describe('atlas_reach follows what the code says and lists the rest one step out', () => {
  let answer;
  before(async () => {
    const client = await connect(repo);
    try {
      ({ answer } = await call(client, 'atlas_reach', { paths: ['lib/core.js'] }));
    } finally {
      await client.close();
    }
  });

  it('follows imports and parsed readers as far as they go', () => {
    assert.deepEqual(items(answer, 'importedBy', { basis: 'parsed', tests: false }), [
      { path: 'app/main.js', via: 'lib/core.js', depth: 1 },
      { path: 'tools/cli.js', via: 'tools/report.js', depth: 2 },
    ]);
    assert.deepEqual(items(answer, 'readBy', { basis: 'parsed', tests: false }), [
      { path: 'tools/report.js', via: 'lib/core.js', depth: 1, place: 'data/state.json' },
    ]);
  });

  it('lists a text-found reader one step out and does not follow it', () => {
    const [text] = groups(answer, 'readBy', { basis: 'text' });
    assert.deepEqual(text.items, [{ path: 'site/index.html', place: 'data/state.json', via: 'lib/core.js' }]);
    assert.equal(text.followed, false);
    const everything = JSON.stringify(answer.facts);
    assert.ok(!everything.includes('build/pack.js'), 'what reads the text-found reader is never reached');
    assert.ok(!everything.includes('"Site"'), 'nor the door that runs it');
  });

  it('lists the doors first, then production files, then tests, then what is not followed', () => {
    const order = answer.facts.map((entry) => `${entry.fact}${entry.tests ? '/tests' : ''}${entry.followed === false ? '/not followed' : ''}`);
    assert.deepEqual(order, ['asked', 'reachedThrough', 'importedBy', 'readBy', 'importedBy/tests', 'parts', 'parts/tests', 'readBy/not followed', 'changesWith/not followed']);
    assert.deepEqual(items(answer, 'reachedThrough'), [{ door: 'CI', through: 'app/main.js' }]);
    assert.deepEqual(items(answer, 'importedBy', { tests: true }), [{ path: 'app/main.test.js', via: 'app/main.js', depth: 2 }]);
  });

  it('lists what changes with the files as history, apart, and never follows it', () => {
    const [history] = groups(answer, 'changesWith', { basis: 'history' });
    assert.equal(history.followed, false);
    assert.deepEqual(history.items.map((item) => [item.file, item.with]), [['lib/core.js', 'lib/other.js']]);
    assert.ok(!items(answer, 'importedBy').some((item) => item.path === 'lib/other.js'));
  });
});

describe('atlas_changes', () => {
  it('refuses a ref that names no commit, one whose tree holds no map, and one shaped like an option', async () => {
    const client = await connect(repo);
    try {
      const missing = await client.callTool({ name: 'atlas_changes', arguments: { since: 'no-such-ref' } });
      assert.equal(missing.structuredContent.error.code, 'ATLAS_DIFF_NO_BASE');
      const mapless = git(repo, ['rev-list', '--max-parents=0', 'HEAD']);
      const empty = await client.callTool({ name: 'atlas_changes', arguments: { since: mapless } });
      assert.equal(empty.structuredContent.error.code, 'ATLAS_DIFF_NO_BASE');
      const option = await client.callTool({ name: 'atlas_changes', arguments: { since: '--output=x' } });
      assert.equal(option.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
    } finally {
      await client.close();
    }
  });
});
