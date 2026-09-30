import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { changedRows, checkoutSnapshot } from '../core/checkout-state.js';
import { mappedRepository } from './test-client.js';
import { assertInventsNothing, committedMap, explainJson } from './test-oracle.js';

/**
 * A tree exported without its git history (docs/atlas-production.spec.md,
 * Part 1 item 4): a copy of a mapped repository with no .git. atlas explain,
 * atlas gaps and the sidecar's map-only tools answer from its atlas/, say
 * "an exported tree: history and freshness not checked" as a line and as a
 * field, and claim nothing about what changed after the map. What needs git
 * (atlas map, atlas check, atlas_changes, atlas_check_change, atlas_refresh,
 * any ref) refuses with ATLAS_NOT_A_REPOSITORY and names what works there.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-reach');
const EXPORTED_LINE = 'an exported tree: history and freshness not checked';
const scratch = [];
let mapped;
let exported;
let env;
let client;
let before_;

before(async () => {
  mapped = mappedRepository(FIXTURE, { together: ['lib/core.js', 'lib/other.js'], prefix: 'atlas-exported-source-' });
  scratch.push(mapped);
  const holder = mkdtempSync(join(tmpdir(), 'atlas-exported-'));
  scratch.push(holder);
  exported = join(holder, 'tree');
  cpSync(mapped, exported, { recursive: true, filter: (path) => !/[\\/]\.git$/.test(path) });
  // git must not find a repository above the copy, wherever the temporary
  // directory is.
  env = { ...process.env, GIT_CEILING_DIRECTORIES: holder };
  before_ = checkoutSnapshot(exported);
  client = new Client({ name: 'atlas-exported-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd: exported, env, stderr: 'pipe' }));
});

after(async () => {
  await client?.close();
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

function unchanged(label) {
  assert.deepEqual(changedRows(before_, checkoutSnapshot(exported)), [], `after ${label}, the tree is as it was`);
}

function cli(args, cwd = exported) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: 'utf8' });
  unchanged(`atlas ${args.join(' ')}`);
  return { status: result.status, stdout: result.stdout, lines: result.stdout.trimEnd().split('\n') };
}

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  unchanged(`${name} ${JSON.stringify(args)}`);
  return result;
}

describe('atlas explain and atlas gaps in an exported tree', () => {
  it('answer from its atlas/ and say it is an exported tree', () => {
    const explained = cli(['explain', 'lib/core.js']);
    assert.equal(explained.status, 0, explained.stdout);
    assert.match(explained.lines.at(-1), new RegExp(`^Map from commit [0-9a-f]{7}, \\d{4}-\\d\\d-\\d\\d; ${EXPORTED_LINE}\\.$`));
    const inside = cli(['explain', 'core.js'], join(exported, 'lib'));
    assert.equal(inside.status, 0, inside.stdout);
    assert.equal(inside.lines[0], 'lib/core.js is in lib (code).', 'a path is read from where the caller stands');
    const gaps = cli(['gaps']);
    assert.equal(gaps.status, 0, gaps.stdout);
    assert.match(gaps.lines.at(-1), new RegExp(`; ${EXPORTED_LINE}\\.$`));
  });

  it('state the facts the mapped repository states, with the exported tree as a field', () => {
    const json = cli(['explain', 'lib/core.js', '--json']);
    const { exported: field, ...facts } = JSON.parse(json.stdout);
    assert.deepEqual(field, { freshnessChecked: false, historyChecked: false });
    assert.deepEqual(facts, explainJson(mapped, 'lib/core.js'));
    const gaps = JSON.parse(cli(['gaps', '--json']).stdout);
    assert.deepEqual(gaps.exported, { freshnessChecked: false, historyChecked: false });
  });

  it('refuse a ref, and atlas map and atlas check refuse and name what works here', () => {
    const ref = cli(['explain', 'lib/core.js', '--ref', 'origin/main']);
    assert.equal(ref.status, 2);
    assert.equal(ref.lines[0], 'ATLAS_NOT_A_REPOSITORY  The directory is not in a git repository.');
    for (const command of ['map', 'check']) {
      const result = cli([command]);
      assert.equal(result.status, 2, result.stdout);
      assert.equal(result.lines[0], 'ATLAS_NOT_A_REPOSITORY  The directory is not in a git repository.');
      assert.equal(result.lines[2], `  what to do:     run atlas ${command} inside a git repository; here, in a tree exported without its history, atlas explain and atlas gaps answer from atlas/`);
    }
  });
});

describe('the sidecar in an exported tree', () => {
  it('answers the map-only tools from atlas/, with the exported line and field and no claim of change', async () => {
    const source = committedMap(exported);
    for (const [name, args] of [['atlas_overview', {}], ['atlas_explain', { path: 'lib/core.js' }], ['atlas_reach', { paths: ['lib/core.js'] }], ['atlas_test_gaps', { path: 'lib' }]]) {
      const result = await call(name, args);
      assert.notEqual(result.isError, true, result.content[0].text);
      const { atlas, answer } = result.structuredContent;
      assert.deepEqual(atlas.exported, { historyChecked: false, freshnessChecked: false }, name);
      assert.ok(atlas.line.endsWith(` · ${EXPORTED_LINE}`), atlas.line);
      assert.equal(atlas.map.snapshot, 'exported');
      assert.equal('changed' in atlas.checkout, false, 'nothing is said to have changed after the map');
      assert.doesNotMatch(result.content[0].text, /changed after the map|HEAD [0-9a-f]{7}/);
      if (name === 'atlas_explain') assertInventsNothing(name, answer, source, { explained: explainJson(mapped, 'lib/core.js') });
      else if (name !== 'atlas_test_gaps') assertInventsNothing(name, answer, source);
    }
  });

  it('refuses what needs git, and names the tools that answer here', async () => {
    for (const [name, args] of [['atlas_changes', { since: 'HEAD~1' }], ['atlas_check_change', {}], ['atlas_refresh', {}], ['atlas_explain', { path: 'lib/core.js', ref: 'origin/main' }]]) {
      const result = await call(name, args);
      assert.equal(result.isError, true, name);
      const { error, atlas } = result.structuredContent;
      assert.equal(error.code, 'ATLAS_NOT_A_REPOSITORY', name);
      assert.match(error.whatToDo, /^in an exported tree, atlas_overview, atlas_explain, atlas_reach, atlas_test_gaps answer from atlas\/ without a ref; /, name);
      assert.ok(atlas.line.endsWith(EXPORTED_LINE), name);
    }
  });
});
