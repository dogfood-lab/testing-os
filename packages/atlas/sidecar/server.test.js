import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { initializeParams, modernMeta, startServer } from './test-client.js';

/**
 * `atlas mcp` driven line by line over stdio, as a host drives it: both eras
 * of revision 2026-07-28, the negotiation on initialize, ping, the tool list
 * and a call, roots, the framing errors, and a stdout that carries nothing
 * but protocol messages.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/explain-places');
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const roots = [];
let repo;
let commit;

function scratch(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

before(() => {
  repo = scratch('atlas-mcp-repo-');
  cpSync(FIXTURE, repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'fixture']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: repo, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  git(repo, ['add', 'atlas']);
  git(repo, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'map']);
  commit = JSON.parse(readFileSync(join(repo, 'atlas', 'structure.json'), 'utf8')).generatedFrom.commit;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

// Every line the server wrote to stdout is one JSON-RPC 2.0 message.
function assertProtocolOnly(server) {
  for (const line of server.lines) {
    const message = JSON.parse(line);
    assert.equal(message.jsonrpc, '2.0', line);
  }
}

describe('atlas mcp: the handshake revisions', () => {
  it('negotiates the version on initialize, answers ping, lists the tool and calls it', async () => {
    const server = startServer({ cwd: repo });
    const init = await server.request('initialize', initializeParams('2025-11-25'));
    assert.equal(init.result.protocolVersion, '2025-11-25');
    assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
    assert.deepEqual(init.result.serverInfo, { name: 'atlas', title: 'Atlas', version: VERSION });
    assert.equal(typeof init.result.instructions, 'string');
    server.notify('notifications/initialized');
    assert.deepEqual((await server.request('ping')).result, {});

    const listed = (await server.request('tools/list')).result.tools;
    const explain = listed.find((tool) => tool.name === 'atlas_explain');
    assert.ok(explain, JSON.stringify(listed));
    for (const tool of listed) {
      assert.equal(tool.inputSchema.type, 'object', tool.name);
      assert.equal(tool.outputSchema.type, 'object', tool.name);
      assert.deepEqual({ ...tool.annotations, title: undefined }, { title: undefined, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, tool.name);
    }

    const called = (await server.request('tools/call', { name: 'atlas_explain', arguments: { path: 'store' } })).result;
    assert.equal(called.isError, undefined);
    assert.equal(called.content.length, 1);
    assert.equal(called.content[0].type, 'text');
    assert.match(called.content[0].text, /^Atlas /);
    assert.equal(called.structuredContent.answer.found.path, 'store');
    assert.equal(called.structuredContent.atlas.map.commit, commit);
    assert.equal(called.structuredContent.atlas.engine, VERSION);
    assert.equal(await server.close(), 0);
    assertProtocolOnly(server);
  });

  it('keeps an older handshake revision it speaks, and offers the newest for one it does not', async () => {
    const older = startServer({ cwd: repo });
    assert.equal((await older.request('initialize', initializeParams('2025-06-18'))).result.protocolVersion, '2025-06-18');
    await older.close();
    const oldest = startServer({ cwd: repo });
    assert.equal((await oldest.request('initialize', initializeParams('2024-11-05'))).result.protocolVersion, '2025-11-25');
    await oldest.close();
  });

  it('refuses a second initialize and a request that names no version before one', async () => {
    const server = startServer({ cwd: repo });
    const early = await server.request('tools/list');
    assert.equal(early.error.code, -32602);
    assert.deepEqual(early.error.data.supported, ['2026-07-28', '2025-11-25', '2025-06-18']);
    await server.request('initialize', initializeParams());
    assert.equal((await server.request('initialize', initializeParams())).error.code, -32600);
    await server.close();
  });

  it('answers an unknown tool with a protocol error and bad arguments with a tool error in the error shape', async () => {
    const server = startServer({ cwd: repo });
    await server.request('initialize', initializeParams());
    server.notify('notifications/initialized');
    const unknown = await server.request('tools/call', { name: 'atlas_write', arguments: {} });
    assert.equal(unknown.error.code, -32602);
    const bad = (await server.request('tools/call', { name: 'atlas_explain', arguments: { path: 7, extra: true } })).result;
    assert.equal(bad.isError, true);
    assert.equal(bad.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
    assert.deepEqual(bad.structuredContent.error.whatChanged, ['path must be a string', 'extra is not an argument this tool takes']);
    assert.equal(typeof bad.structuredContent.error.sentence, 'string');
    assert.equal(typeof bad.structuredContent.error.whatToDo, 'string');
    const missing = (await server.request('tools/call', { name: 'atlas_explain', arguments: { path: 'nowhere' } })).result;
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent.error.code, 'ATLAS_EXPLAIN_UNKNOWN_PATH');
    await server.close();
  });
});

describe('atlas mcp: revision 2026-07-28, one request at a time', () => {
  it('answers server/discover with the versions, capabilities and identity', async () => {
    const server = startServer({ cwd: repo });
    const found = (await server.request('server/discover', { _meta: modernMeta() })).result;
    assert.deepEqual(found.supportedVersions, ['2026-07-28', '2025-11-25', '2025-06-18']);
    assert.deepEqual(found.capabilities, { tools: { listChanged: false } });
    assert.equal(found.resultType, 'complete');
    assert.deepEqual(found._meta['io.modelcontextprotocol/serverInfo'], { name: 'atlas', title: 'Atlas', version: VERSION });
    assert.equal(typeof found.ttlMs, 'number');
    assert.equal(found.cacheScope, 'public');
    await server.close();
  });

  it('lists and calls with the version on every request and no session', async () => {
    const server = startServer({ cwd: repo });
    const listed = (await server.request('tools/list', { _meta: modernMeta() })).result;
    assert.equal(listed.resultType, 'complete');
    assert.ok(listed.tools.some((tool) => tool.name === 'atlas_explain'));
    const called = (await server.request('tools/call', { name: 'atlas_explain', arguments: { path: 'engine' }, _meta: modernMeta() })).result;
    assert.equal(called.resultType, 'complete');
    assert.equal(called.structuredContent.answer.found.kind, 'part');
    await server.close();
  });

  it('refuses a version it does not speak, listing those it does, and a request missing capabilities', async () => {
    const server = startServer({ cwd: repo });
    const refused = await server.request('tools/list', { _meta: modernMeta('1900-01-01') });
    assert.deepEqual(refused.error, {
      code: -32022,
      message: 'Unsupported protocol version',
      data: { supported: ['2026-07-28', '2025-11-25', '2025-06-18'], requested: '1900-01-01' },
    });
    const meta = modernMeta();
    delete meta['io.modelcontextprotocol/clientCapabilities'];
    assert.equal((await server.request('tools/list', { _meta: meta })).error.code, -32602);
    await server.close();
  });
});

describe('atlas mcp: roots', () => {
  it('answers for the client root when the client offers one, whatever directory it started in', async () => {
    const elsewhere = scratch('atlas-mcp-elsewhere-');
    assert.notEqual(spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: elsewhere, encoding: 'utf8' }).status, 0, 'the scratch directory is in no repository');
    let asked = 0;
    const server = startServer({
      cwd: elsewhere,
      onRequest: (message) => {
        assert.equal(message.method, 'roots/list');
        asked += 1;
        return { roots: [{ uri: pathToFileURL(repo).href, name: 'fixture' }] };
      },
    });
    await server.request('initialize', initializeParams('2025-11-25', { roots: { listChanged: true } }));
    server.notify('notifications/initialized');
    const called = (await server.request('tools/call', { name: 'atlas_explain', arguments: { path: 'store' } })).result;
    assert.equal(asked, 1);
    assert.equal(called.structuredContent.atlas.map.commit, commit);
    server.notify('notifications/roots/list_changed');
    await server.request('ping');
    await server.request('tools/call', { name: 'atlas_explain', arguments: { path: 'store' } });
    assert.equal(asked, 2, 'a changed list is asked for again');
    await server.close();
    assertProtocolOnly(server);
  });

  it('answers for the working directory when no root is offered, and says when that is in no repository', async () => {
    const elsewhere = scratch('atlas-mcp-nowhere-');
    const server = startServer({ cwd: elsewhere });
    await server.request('initialize', initializeParams());
    server.notify('notifications/initialized');
    const called = (await server.request('tools/call', { name: 'atlas_explain', arguments: { path: 'store' } })).result;
    assert.equal(called.isError, true);
    assert.equal(called.structuredContent.error.code, 'ATLAS_SIDECAR_NOT_A_REPOSITORY');
    await server.close();
  });
});

describe('atlas mcp: framing', () => {
  it('answers a line that is not JSON, and a batch, with errors of id null, and keeps serving', async () => {
    const server = startServer({ cwd: repo });
    assert.equal((await server.raw('{not json')).error.code, -32700);
    assert.equal((await server.raw('[{"jsonrpc":"2.0","id":9,"method":"ping"}]')).error.code, -32600);
    assert.deepEqual((await server.request('ping')).result, {});
    assert.equal(await server.close(), 0);
    assertProtocolOnly(server);
  });

  it('refuses arguments to the command on stderr, leaving stdout empty', () => {
    const result = spawnSync(process.execPath, [CLI, 'mcp', '--port', '80'], { cwd: repo, encoding: 'utf8', input: '' });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /mcp takes no arguments/);
  });
});
