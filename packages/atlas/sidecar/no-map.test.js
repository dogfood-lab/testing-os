import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { changedRows, checkoutSnapshot } from '../core/checkout-state.js';
import { createRefresher } from './refresh.js';
import { commitAll, git, staleClone } from './test-client.js';
import { createTools } from './tools.js';

/**
 * The no-map message (docs/atlas-production.spec.md, Part 1 item 3): a
 * checkout with no map is told, in order, of a fetched ref that holds one
 * (the argument to pass and how far behind the checkout is), then of
 * atlas_refresh, which writes only its cache, and last of a map made and
 * committed here. atlas_refresh cannot map a checkout with no boundary file,
 * so there it is not offered. The command line says the same, without the
 * refresh, which is a sidecar tool.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-reach');
const scratch = [];
let stale;
let bare;
let cache;
let tools;

before(() => {
  stale = staleClone(FIXTURE);
  scratch.push(stale.base);
  // A branch the remote holds from before the map, for a checkout whose own
  // upstream holds no map while the remote's default does.
  git(stale.work, ['push', '-q', stale.remote, `${stale.start}:refs/heads/early`]);
  git(stale.clone, ['fetch', '-q', 'origin']);
  // A repository with neither a map nor a boundary file, and no remote.
  bare = mkdtempSync(join(tmpdir(), 'atlas-no-map-'));
  scratch.push(bare);
  mkdirSync(join(bare, 'lib'));
  writeFileSync(join(bare, 'lib', 'a.js'), 'export const a = 1;\n');
  writeFileSync(join(bare, 'package.json'), '{ "name": "no-map", "type": "module" }\n');
  git(bare, ['init', '-q']);
  git(bare, ['config', 'maintenance.auto', 'false']);
  git(bare, ['config', 'gc.auto', '0']);
  commitAll(bare, 'first');
  cache = mkdtempSync(join(tmpdir(), 'atlas-no-map-cache-'));
  scratch.push(cache);
  tools = createTools({ refresher: createRefresher({ env: { ...process.env, LOCALAPPDATA: cache, XDG_CACHE_HOME: cache } }) });
});

after(async () => {
  await tools?.stop();
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

function ask(cwd, name, args = {}) {
  return tools.callTool(name, args, { roots: [], cwd });
}

function cli(cwd, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, lines: result.stdout.trimEnd().split('\n') };
}

// Calls atlas_refresh until the map it started finishes or fails.
async function refreshed(cwd) {
  const deadline = Date.now() + 180_000;
  for (;;) {
    const result = await ask(cwd, 'atlas_refresh');
    const state = result.structuredContent.answer?.refresh?.state;
    if (result.isError || state === 'done' || state === 'current') return result;
    assert.ok(Date.now() < deadline, 'the refresh finishes');
    await delay(100);
  }
}

describe('a clone three commits behind a remote that holds a map', () => {
  it('is offered the ref first, then atlas_refresh, then a map made here', async () => {
    const before_ = checkoutSnapshot(stale.clone);
    for (const [name, args] of [['atlas_explain', { path: 'lib/core.js' }], ['atlas_overview', {}], ['atlas_reach', { paths: ['lib/core.js'] }], ['atlas_test_gaps', {}]]) {
      const result = await ask(stale.clone, name, args);
      assert.equal(result.isError, true, name);
      const { error } = result.structuredContent;
      assert.equal(error.code, 'ATLAS_SIDECAR_NO_MAP', name);
      assert.deepEqual(error.whatChanged, ['the committed map: structure.json is absent', `origin/main (${stale.tip.slice(0, 7)}) holds a map`], name);
      assert.equal(error.whatToDo, 'ask again with ref origin/main, which holds a map; this checkout is 3 commits behind it; '
        + 'else call atlas_refresh, which maps this checkout into a cache outside it and writes nothing here; '
        + 'else run atlas map and commit atlas/', name);
      assert.doesNotMatch(result.content[0].text, /atlas init/, 'a checkout with a boundary file is not told to write one');
    }
    for (const command of [['explain', 'lib/core.js'], ['gaps']]) {
      const result = cli(stale.clone, command);
      assert.equal(result.status, 2);
      assert.equal(result.lines[2], `                  origin/main (${stale.tip.slice(0, 7)}) holds a map`);
      assert.equal(result.lines[3], '  what to do:     run it again with --ref origin/main, which holds a map; this checkout is 3 commits behind it; else run atlas map and commit atlas/');
    }
    assert.deepEqual(changedRows(before_, checkoutSnapshot(stale.clone)), [], 'the checkout is as it was');
  });

  it('keeps each offer: the ref answers, and atlas_refresh maps the checkout into its cache', async () => {
    const atRef = await ask(stale.clone, 'atlas_explain', { path: 'lib/core.js', ref: 'origin/main' });
    assert.notEqual(atRef.isError, true, atRef.content[0].text);
    const before_ = checkoutSnapshot(stale.clone);
    const done = await refreshed(stale.clone);
    assert.notEqual(done.isError, true, done.content[0].text);
    const answer = await ask(stale.clone, 'atlas_explain', { path: 'lib/core.js' });
    assert.notEqual(answer.isError, true, answer.content[0].text);
    assert.match(answer.structuredContent.atlas.map.snapshot, /^refresh:/);
    assert.deepEqual(changedRows(before_, checkoutSnapshot(stale.clone)), [], 'the checkout is as it was');
  });

  it('offers the remote default when the branch upstream holds no map', async () => {
    const early = mkdtempSync(join(tmpdir(), 'atlas-no-map-early-'));
    scratch.push(early);
    rmSync(early, { recursive: true, force: true });
    git(stale.base, ['clone', '-q', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-b', 'early', stale.remote, early]);
    const result = await ask(early, 'atlas_overview');
    assert.equal(result.structuredContent.error.code, 'ATLAS_SIDECAR_NO_MAP');
    assert.match(result.structuredContent.error.whatToDo, /^ask again with ref origin\/main, which holds a map; this checkout is 3 commits behind it; /);
  });
});

describe('a repository with no map and no boundary file', () => {
  it('cannot be mapped by atlas_refresh, so the refresh is not offered', async () => {
    const failed = await refreshed(bare);
    assert.equal(failed.isError, true, 'atlas_refresh fails without a boundary file');
    assert.equal(failed.structuredContent.error.code, 'ATLAS_SIDECAR_REFRESH_FAILED');
    assert.match(failed.structuredContent.error.whatChanged[0], /ATLAS_NO_BOUNDARY_FILE/);
    const result = await ask(bare, 'atlas_explain', { path: 'lib/a.js' });
    assert.equal(result.structuredContent.error.code, 'ATLAS_SIDECAR_NO_MAP');
    assert.equal(result.structuredContent.error.whatToDo, 'run atlas init, then atlas map, and commit atlas/');
    const explained = cli(bare, ['explain', 'lib/a.js']);
    assert.equal(explained.lines[2], '  what to do:     run atlas init, then atlas map, and commit atlas/');
  });
});
