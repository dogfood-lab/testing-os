import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { changedRows, checkoutSnapshot } from '../core/checkout-state.js';
import { mappedRepository } from './test-client.js';

/**
 * No tool writes the repository (docs/atlas-sidecar.spec.md, "Safety"): after
 * every tool, atlas_refresh included, every file of the checkout, .git
 * included, has the bytes and the mtime it had before, by the same "as it
 * was" check the fleet service is held to. The checkout carries uncommitted
 * work, so the status, the re-reads and the check of a change all have
 * something to read.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-reach');
const scratch = [];

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

describe('every tool reads only', () => {
  it('leaves the checkout, .git included, byte for byte and mtime as it was, atlas_refresh included', async () => {
    const repo = mappedRepository(FIXTURE, { together: ['lib/core.js', 'lib/other.js'], prefix: 'atlas-read-only-' });
    const cache = mkdtempSync(join(tmpdir(), 'atlas-read-only-cache-'));
    scratch.push(repo, cache);
    appendFileSync(join(repo, 'lib', 'core.js'), '// edited, not committed\n');
    writeFileSync(join(repo, 'lib', 'fresh.js'), "import { core } from './core.js';\n\nexport const fresh = core;\n");
    const before = checkoutSnapshot(repo);
    const unchanged = (label) => assert.deepEqual(changedRows(before, checkoutSnapshot(repo)), [], `after ${label}, the checkout is as it was`);

    const client = new Client({ name: 'atlas-read-only-test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [CLI, 'mcp'],
      cwd: repo,
      env: { ...process.env, LOCALAPPDATA: cache, XDG_CACHE_HOME: cache },
      stderr: 'pipe',
    }));
    try {
      await client.listTools();
      unchanged('tools/list');
      const calls = [
        ['atlas_overview', {}],
        ['atlas_explain', { path: 'lib/core.js' }],
        ['atlas_explain', { path: 'data' }],
        ['atlas_explain', { path: 'lib' }],
        ['atlas_explain', { path: 'no/such/file.js' }],
        ['atlas_reach', { paths: ['lib/core.js', 'lib/other.js'] }],
        ['atlas_reach', { paths: ['lib/core.js'], part: 'app', kind: 'importedBy', full: true }],
        ['atlas_changes', { since: 'HEAD~1' }],
        ['atlas_changes', { since: 'HEAD' }],
        ['atlas_check_change', {}],
        ['atlas_check_change', { files: ['lib/core.js', 'lib/fresh.js'] }],
        ['atlas_explain', { path: 'lib/core.js', cursor: '0000000000000000:f0:1' }],
      ];
      for (const [name, args] of calls) {
        await client.callTool({ name, arguments: args });
        unchanged(`${name} ${JSON.stringify(args)}`);
      }

      // A refresh maps the checkout in a child process; the checkout is
      // checked while it runs and after it is swapped in.
      let state = 'started';
      const deadline = Date.now() + 180_000;
      while (state === 'started' || state === 'running') {
        const result = await client.callTool({ name: 'atlas_refresh', arguments: {} });
        assert.notEqual(result.isError, true, result.content[0].text);
        state = result.structuredContent.answer.refresh.state;
        unchanged(`atlas_refresh (${state})`);
        assert.ok(Date.now() < deadline, 'the refresh finishes');
        await delay(100);
      }
      assert.equal(state, 'done');
      const refreshed = await client.callTool({ name: 'atlas_explain', arguments: { path: 'lib/core.js' } });
      assert.match(refreshed.structuredContent.atlas?.map?.snapshot ?? '', /^refresh:/, refreshed.content[0].text);
      unchanged('an answer from the refreshed map');
    } finally {
      await client.close();
    }
    unchanged('the server stopped');
  });
});
