import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readBoundaryFile } from '../adapter/boundary-file.js';
import { buildMap, writeMap } from '../adapter/commands.js';
import { ENGINE } from '../adapter/engine.js';
import { changedRows, checkoutSnapshot } from '../core/checkout-state.js';
import { cacheRoot, createRefresher, workerEnv } from './refresh.js';
import { git, mappedRepository } from './test-client.js';
import { createTools } from './tools.js';

/**
 * atlas_refresh: the checkout mapped again with this engine, in the
 * background, into a cache outside the repository keyed by the repository
 * and HEAD, then swapped in whole. An answer given while the map runs uses
 * the snapshot it had and names it; the repository is never written.
 *
 * The first half drives the refresher with a worker the test finishes by
 * hand, so "while the map runs" is a state the test holds rather than a
 * race it hopes to win. The second half runs the real worker through the
 * official SDK client.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-reach');
const PHASES = ['starting', 'reading the tracked files', 'reading the history', 'writing the page', 'writing the snapshot'];
const scratch = [];

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

function repository() {
  const root = mappedRepository(FIXTURE, { together: ['lib/core.js', 'lib/other.js'], prefix: 'atlas-refresh-' });
  scratch.push(root);
  return root;
}

function directory(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(path);
  return path;
}

// Both variables name the same directory, so the cache lands there on every
// platform: LOCALAPPDATA on Windows, XDG_CACHE_HOME elsewhere.
function cacheEnv(dir) {
  return { LOCALAPPDATA: dir, XDG_CACHE_HOME: dir };
}

/**
 * A worker the test drives: it reports a phase, fails, or finishes by
 * writing the map the real worker would write, each when the test says so.
 */
function handDriven() {
  const workers = [];
  const spawnWorker = ({ root, out }) => {
    const child = new EventEmitter();
    child.stderr = null;
    child.kill = () => {
      child.killed = true;
      setImmediate(() => child.emit('exit', null, 'SIGTERM'));
    };
    workers.push({
      root,
      out,
      child,
      progress(phase) {
        child.emit('message', { progress: phase });
      },
      // Part of the map is on disk, as it would be midway through writing.
      startWriting() {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, 'structure.json'), '{');
      },
      finish() {
        const boundary = readBoundaryFile(root);
        const commit = git(root, ['rev-parse', 'HEAD']);
        mkdirSync(out, { recursive: true });
        writeMap(out, buildMap({ repo: root, boundary, commit }));
        const at = new Date().toISOString();
        writeFileSync(join(out, 'snapshot.json'), `${JSON.stringify({ engine: ENGINE, head: commit, startedAt: at, finishedAt: at, durationMs: 0 })}\n`);
        child.emit('exit', 0, null);
      },
      fail(message) {
        child.emit('message', { error: message });
        child.emit('exit', 1, null);
      },
    });
    return child;
  };
  return { workers, spawnWorker };
}

function refreshOf(result) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return result.structuredContent.answer.refresh;
}

describe('where atlas_refresh caches a map', () => {
  it('is %LOCALAPPDATA%/atlas on Windows, else $XDG_CACHE_HOME/atlas when that is absolute, else ~/.cache/atlas', () => {
    assert.equal(cacheRoot({ LOCALAPPDATA: 'D:\\cache', XDG_CACHE_HOME: '/srv/cache' }, 'win32', 'D:\\profile'), 'D:\\cache\\atlas');
    assert.equal(cacheRoot({}, 'win32', 'D:\\profile'), 'D:\\profile\\AppData\\Local\\atlas');
    assert.equal(cacheRoot({ XDG_CACHE_HOME: '/srv/cache', LOCALAPPDATA: 'D:\\cache' }, 'linux', '/srv/runner'), '/srv/cache/atlas');
    assert.equal(cacheRoot({ XDG_CACHE_HOME: 'relative/cache' }, 'linux', '/srv/runner'), '/srv/runner/.cache/atlas',
      'the XDG specification says a relative path is to be ignored');
    assert.equal(cacheRoot({}, 'darwin', '/srv/runner'), '/srv/runner/.cache/atlas');
  });

  it('starts the worker with every git in it reading only, after any git configuration the host set', () => {
    const env = workerEnv({ PATH: 'bin', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.pager', GIT_CONFIG_VALUE_0: 'cat' });
    assert.equal(env.PATH, 'bin');
    assert.equal(env.GIT_OPTIONAL_LOCKS, '0', 'a status the engine runs does not refresh .git/index');
    assert.equal(env.GIT_NO_LAZY_FETCH, '1', 'a partial clone fetches nothing');
    assert.equal(env.GIT_CONFIG_COUNT, '2');
    assert.deepEqual([env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_VALUE_0], ['core.pager', 'cat'], "the host's own setting stays");
    assert.deepEqual([env.GIT_CONFIG_KEY_1, env.GIT_CONFIG_VALUE_1], ['core.fsmonitor', 'false']);
    const bare = workerEnv({});
    assert.deepEqual([bare.GIT_CONFIG_COUNT, bare.GIT_CONFIG_KEY_0, bare.GIT_CONFIG_VALUE_0], ['1', 'core.fsmonitor', 'false']);
  });
});

describe('atlas_refresh with a worker the test finishes', () => {
  it('answers from the snapshot it had while the map runs, names it, and swaps the new map in whole', async () => {
    const repo = repository();
    const cache = directory('atlas-refresh-cache-');
    const { workers, spawnWorker } = handDriven();
    const tools = createTools({ refresher: createRefresher({ spawnWorker, env: cacheEnv(cache) }) });
    const context = { roots: [], cwd: repo };
    // A new file, staged and not committed: the committed map has never seen
    // it, and a map of the checkout reads it.
    writeFileSync(join(repo, 'lib', 'fresh.js'), "import { core } from './core.js';\n\nexport const fresh = core;\n");
    git(repo, ['add', 'lib/fresh.js']);
    const head = git(repo, ['rev-parse', 'HEAD']);

    const unseen = await tools.callTool('atlas_explain', { path: 'lib/fresh.js' }, context);
    assert.equal(unseen.isError, true);
    assert.equal(unseen.structuredContent.error.code, 'ATLAS_EXPLAIN_UNKNOWN_PATH');
    assert.equal(unseen.structuredContent.atlas.map.snapshot, 'committed');

    const started = await tools.callTool('atlas_refresh', {}, context);
    const first = refreshOf(started);
    assert.equal(first.state, 'started');
    assert.equal(first.head, head);
    assert.equal(first.engine, ENGINE);
    assert.equal(first.snapshot, null);
    assert.equal(dirname(first.cache), resolve(cache, 'atlas'), 'the cache is keyed by the repository under the cache root');
    assert.equal(started.structuredContent.atlas.map.snapshot, 'committed', 'the call that starts a map answers from the map it had');
    assert.match(started.content[0].text, /in the background, into a cache outside the repository/);
    assert.equal(workers.length, 1);
    assert.equal(dirname(workers[0].out), first.cache);

    workers[0].progress('reading the history');
    workers[0].startWriting();
    const running = refreshOf(await tools.callTool('atlas_refresh', {}, context));
    assert.equal(running.state, 'running');
    assert.equal(running.phase, 'reading the history', 'the answer reports the phase the worker last reported');
    assert.equal(workers.length, 1, 'a call while a map runs reports it and starts no other');

    const meanwhile = await tools.callTool('atlas_explain', { path: 'lib/fresh.js' }, context);
    assert.equal(meanwhile.structuredContent.atlas.map.snapshot, 'committed', 'an answer given while the map runs uses the old snapshot');
    assert.equal(meanwhile.structuredContent.error.code, 'ATLAS_EXPLAIN_UNKNOWN_PATH', 'and nothing of the unfinished map');
    assert.match(meanwhile.content[0].text, /^Atlas [^\n]* · map [0-9a-f]{7},/, 'the answer names the map it used');

    workers[0].finish();
    const done = refreshOf(await tools.callTool('atlas_refresh', {}, context));
    assert.equal(done.state, 'done');
    assert.equal(done.phase, null);
    assert.match(done.snapshot, new RegExp(`^refresh:${head.slice(0, 12)}:`));
    assert.equal(typeof done.durationMs, 'number');

    const explained = await tools.callTool('atlas_explain', { path: 'lib/fresh.js' }, context);
    assert.notEqual(explained.isError, true, explained.content[0].text);
    assert.equal(explained.structuredContent.atlas.map.snapshot, done.snapshot, 'every answer after the swap names the new snapshot');
    assert.equal(explained.structuredContent.atlas.map.commit, head);
    assert.equal(explained.structuredContent.atlas.map.engine, ENGINE);
    assert.equal(explained.structuredContent.answer.found.kind, 'file');
    assert.match(explained.content[0].text, new RegExp(`^Atlas ${ENGINE} · refresh ${head.slice(0, 7)}, \\d{4}-\\d{2}-\\d{2}, made by Atlas ${ENGINE} · HEAD ${head.slice(0, 7)}`));
    assert.deepEqual(explained.structuredContent.atlas.checkout.changed, [], 'the staged file is what the new map read, not a change after it');

    const current = refreshOf(await tools.callTool('atlas_refresh', {}, context));
    assert.equal(current.state, 'current');
    assert.equal(workers.length, 1, 'a finished map of a checkout that has not changed is not made again');
    assert.deepEqual(readdirSync(first.cache), [head], 'the snapshot is filed under its HEAD, and nothing unfinished is left');
    assert.deepEqual(readdirSync(join(first.cache, head)).sort(), ['README.md', 'page.json', 'snapshot.json', 'statistics.json', 'structure.json']);
  });

  it('reports a map that failed, keeps the old snapshot, and makes it again only once the checkout changes', async () => {
    const repo = repository();
    const cache = directory('atlas-refresh-cache-');
    const { workers, spawnWorker } = handDriven();
    const tools = createTools({ refresher: createRefresher({ spawnWorker, env: cacheEnv(cache) }) });
    const context = { roots: [], cwd: repo };

    assert.equal(refreshOf(await tools.callTool('atlas_refresh', {}, context)).state, 'started');
    workers[0].startWriting();
    workers[0].fail('ATLAS_BOUNDARY_FILE_INVALID: atlas/boundaries.yaml is not valid YAML');
    const failed = await tools.callTool('atlas_refresh', {}, context);
    assert.equal(failed.isError, true);
    assert.equal(failed.structuredContent.error.code, 'ATLAS_SIDECAR_REFRESH_FAILED');
    assert.deepEqual(failed.structuredContent.error.whatChanged, ['ATLAS_BOUNDARY_FILE_INVALID: atlas/boundaries.yaml is not valid YAML']);
    assert.equal(existsSync(workers[0].out), false, 'the unfinished map is removed');
    assert.equal(failed.structuredContent.atlas.map.snapshot, 'committed');

    const overview = await tools.callTool('atlas_overview', {}, context);
    assert.equal(overview.structuredContent.atlas.map.snapshot, 'committed', 'answers keep the snapshot they had');

    const again = await tools.callTool('atlas_refresh', {}, context);
    assert.equal(again.structuredContent.error.code, 'ATLAS_SIDECAR_REFRESH_FAILED');
    assert.equal(workers.length, 1, 'a map that failed on this checkout would fail again, so it is not made again');

    writeFileSync(join(repo, 'lib', 'core.js'), "export const core = 'changed';\n");
    assert.equal(refreshOf(await tools.callTool('atlas_refresh', {}, context)).state, 'started', 'once the checkout changes, it is');
    assert.equal(workers.length, 2);
    await tools.stop();
  });

  it('refuses a cache inside the repository and writes nothing there', async () => {
    const repo = repository();
    const { workers, spawnWorker } = handDriven();
    const tools = createTools({ refresher: createRefresher({ spawnWorker, env: cacheEnv(join(repo, 'cache')) }) });
    const before = checkoutSnapshot(repo);
    const refused = await tools.callTool('atlas_refresh', {}, { roots: [], cwd: repo });
    assert.equal(refused.isError, true);
    assert.equal(refused.structuredContent.error.code, 'ATLAS_SIDECAR_CACHE_INSIDE');
    assert.equal(workers.length, 0);
    assert.deepEqual(changedRows(before, checkoutSnapshot(repo)), []);
  });

  it('stops a map still running when the server stops, and removes what it had written', async () => {
    const repo = repository();
    const cache = directory('atlas-refresh-cache-');
    const { workers, spawnWorker } = handDriven();
    const tools = createTools({ refresher: createRefresher({ spawnWorker, env: cacheEnv(cache) }) });
    const first = refreshOf(await tools.callTool('atlas_refresh', {}, { roots: [], cwd: repo }));
    workers[0].startWriting();
    await tools.stop();
    assert.equal(workers[0].child.killed, true);
    assert.equal(existsSync(workers[0].out), false);
    assert.deepEqual(readdirSync(first.cache), []);
  });
});

describe('atlas_refresh through the SDK client', () => {
  async function connect(cwd, env) {
    const client = new Client({ name: 'atlas-refresh-test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd, env: { ...process.env, ...env }, stderr: 'pipe' }));
    return client;
  }

  // Calls atlas_refresh until the map is no longer running, and returns the
  // last answer with every phase seen on the way.
  async function untilSettled(client) {
    const phases = [];
    const deadline = Date.now() + 180_000;
    for (;;) {
      const result = await client.callTool({ name: 'atlas_refresh', arguments: {} });
      const refresh = result.structuredContent?.answer?.refresh;
      if (refresh?.phase) phases.push(refresh.phase);
      if (result.isError || (refresh.state !== 'started' && refresh.state !== 'running')) return { result, phases };
      assert.ok(Date.now() < deadline, 'the refresh settles within three minutes');
      await delay(100);
    }
  }

  it('maps the checkout in a child process into the cache, keyed by the repository and HEAD, and never writes the repository', async () => {
    const repo = repository();
    const cache = directory('atlas-refresh-cache-');
    const head = git(repo, ['rev-parse', 'HEAD']);
    const committed = JSON.parse(git(repo, ['show', 'HEAD:atlas/structure.json']));
    const before = checkoutSnapshot(repo);
    const client = await connect(repo, cacheEnv(cache));
    try {
      const { result, phases } = await untilSettled(client);
      const refresh = refreshOf(result);
      assert.equal(refresh.state, 'done');
      assert.equal(refresh.head, head);
      assert.equal(refresh.engine, ENGINE);
      for (const phase of phases) assert.ok(PHASES.includes(phase), `a phase the worker reports: ${phase}`);
      assert.equal(dirname(refresh.cache), resolve(cache, 'atlas'));
      assert.deepEqual(readdirSync(refresh.cache), [head]);
      const snapshot = join(refresh.cache, head);
      const meta = JSON.parse(readFileSync(join(snapshot, 'snapshot.json'), 'utf8'));
      assert.deepEqual([meta.engine, meta.head], [ENGINE, head]);
      const structure = JSON.parse(readFileSync(join(snapshot, 'structure.json'), 'utf8'));
      assert.equal(structure.engine, ENGINE);
      assert.equal(structure.generatedFrom.commit, head);
      assert.deepEqual({ ...structure, generatedFrom: null }, { ...committed, generatedFrom: null },
        'the refresh is the map atlas map made of the same files, with the engine that serves it');

      const overview = await client.callTool({ name: 'atlas_overview', arguments: {} });
      assert.equal(overview.structuredContent.atlas.map.snapshot, refresh.snapshot);
      assert.match(overview.content[0].text, new RegExp(`^Atlas ${ENGINE} · refresh ${head.slice(0, 7)}, \\d{4}-\\d{2}-\\d{2}, made by Atlas ${ENGINE} · HEAD ${head.slice(0, 7)}`));
      assert.equal(refreshOf(await client.callTool({ name: 'atlas_refresh', arguments: {} })).state, 'current');
    } finally {
      await client.close();
    }
    assert.deepEqual(changedRows(before, checkoutSnapshot(repo)), [], 'the checkout, .git included, is as it was');
  });

  it('reports a map the engine could not make, and leaves nothing unfinished in the cache', async () => {
    const repo = repository();
    const cache = directory('atlas-refresh-cache-');
    writeFileSync(join(repo, 'atlas', 'boundaries.yaml'), 'boundaries: [\n');
    const before = checkoutSnapshot(repo);
    const client = await connect(repo, cacheEnv(cache));
    try {
      const { result } = await untilSettled(client);
      assert.equal(result.isError, true, result.content[0].text);
      assert.equal(result.structuredContent.error.code, 'ATLAS_SIDECAR_REFRESH_FAILED');
      assert.match(result.structuredContent.error.whatChanged[0], /^ATLAS_BOUNDARY_/);
      const keyed = readdirSync(resolve(cache, 'atlas'));
      assert.equal(keyed.length, 1);
      assert.deepEqual(readdirSync(resolve(cache, 'atlas', keyed[0])), []);
    } finally {
      await client.close();
    }
    assert.deepEqual(changedRows(before, checkoutSnapshot(repo)), []);
  });

  it('stops a map still running when the host closes the input, and leaves nothing unfinished in the cache', async () => {
    const repo = repository();
    const cache = directory('atlas-refresh-cache-');
    const client = await connect(repo, cacheEnv(cache));
    let started;
    try {
      started = refreshOf(await client.callTool({ name: 'atlas_refresh', arguments: {} }));
      assert.equal(started.state, 'started');
    } finally {
      await client.close();
    }
    const left = existsSync(started.cache) ? readdirSync(started.cache) : [];
    assert.deepEqual(left.filter((name) => name.endsWith('.tmp')), []);
  });
});
