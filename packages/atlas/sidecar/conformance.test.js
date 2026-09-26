import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * The sidecar under the official MCP SDK client, over stdio, the way a host
 * starts it: initialize, the tool list, and a call whose structured content
 * the client checks against the tool's output schema. The SDK is a root
 * devDependency pinned exactly; the published package takes no dependency.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/explain-places');
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const scratch = [];
let repo;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'atlas-sdk-repo-'));
  scratch.push(repo);
  cpSync(FIXTURE, repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'fixture']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: repo, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
});

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

async function connect({ cwd, roots = null }) {
  const client = new Client({ name: 'atlas-conformance', version: '0.0.0' }, { capabilities: roots ? { roots: { listChanged: true } } : {} });
  if (roots) client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots }));
  const transport = new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd, stderr: 'pipe' });
  await client.connect(transport);
  return client;
}

describe('the official SDK client', () => {
  it('initializes, lists the tools and calls one, and the structured content fits its output schema', async () => {
    const client = await connect({ cwd: repo });
    try {
      assert.deepEqual(client.getServerVersion(), { name: 'atlas', title: 'Atlas', version: VERSION });
      assert.deepEqual(client.getServerCapabilities(), { tools: { listChanged: false } });
      const { tools } = await client.listTools();
      assert.ok(tools.length >= 1);
      for (const tool of tools) {
        assert.equal(tool.annotations.readOnlyHint, true, tool.name);
        assert.equal(tool.annotations.destructiveHint, false, tool.name);
        assert.equal(tool.annotations.idempotentHint, true, tool.name);
        assert.equal(tool.annotations.openWorldHint, false, tool.name);
        assert.ok(tool.outputSchema, tool.name);
      }
      // callTool checks structuredContent against the outputSchema listTools
      // cached, and throws when it does not fit.
      const result = await client.callTool({ name: 'atlas_explain', arguments: { path: 'store/ledger/latest.json' } });
      assert.equal(result.isError, undefined);
      assert.equal(result.content.length, 1);
      assert.equal(result.structuredContent.answer.path, 'store/ledger/latest.json');
      const failed = await client.callTool({ name: 'atlas_explain', arguments: { path: 'nowhere' } });
      assert.equal(failed.isError, true);
      assert.equal(failed.structuredContent.error.code, 'ATLAS_EXPLAIN_UNKNOWN_PATH');
    } finally {
      await client.close();
    }
  });

  it('answers for the root the client offers', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'atlas-sdk-elsewhere-'));
    scratch.push(elsewhere);
    const client = await connect({ cwd: elsewhere, roots: [{ uri: pathToFileURL(repo).href, name: 'fixture' }] });
    try {
      const result = await client.callTool({ name: 'atlas_explain', arguments: { path: 'engine' } });
      assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
      assert.equal(result.structuredContent.answer.kind, 'part');
    } finally {
      await client.close();
    }
  });
});
