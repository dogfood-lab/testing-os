import { spawnSync } from 'node:child_process';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { changedRows, checkoutSnapshot } from '../core/checkout-state.js';
import { createTools } from './tools.js';
import { commitAll, git, mapIn, mappedRepository, staleClone } from './test-client.js';

/**
 * A newer map upstream (docs/atlas-production.spec.md, Part 1 item 2): when
 * the checkout's map is not the one its fetched upstream holds, and the
 * upstream has commits the checkout does not, the provenance line says so
 * and names the ref to pass. Maps are told apart by the ids git keeps them
 * under. Atlas never switches by itself, and with no upstream, or an
 * upstream the checkout is ahead of, nothing is said.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-reach');
const SAID = /origin\/main holds a different map, 2 commits ahead of this checkout: ask with ref origin\/main to answer from it/;
let stale;
let second;
let lone;
const tools = createTools();

before(() => {
  stale = staleClone(FIXTURE);
  // Upstream moves on: a part starts importing another, and the map is made
  // and committed again.
  writeFileSync(join(stale.work, 'tools', 'report.js'), "import { readFileSync } from 'node:fs';\nimport { label } from '../lib/other.js';\n\nexport function report() {\n  return label(JSON.parse(readFileSync('data/state.json', 'utf8')));\n}\n");
  commitAll(stale.work, 'report labels the state');
  mapIn(stale.work);
  commitAll(stale.work, 'map again');
  second = git(stale.work, ['rev-parse', 'HEAD']);
  git(stale.work, ['push', '-q', stale.remote, 'main']);
  git(stale.clone, ['fetch', '-q', 'origin']);
  git(stale.clone, ['reset', '-q', '--hard', stale.tip]);
  lone = mappedRepository(FIXTURE, { prefix: 'atlas-upstream-lone-' });
});

after(async () => {
  await tools.stop();
  if (stale) rmSync(stale.base, { recursive: true, force: true });
  if (lone) rmSync(lone, { recursive: true, force: true });
});

async function ask(cwd, name, args) {
  const result = await tools.callTool(name, args, { roots: [], cwd });
  assert.notEqual(result.isError, true, result.content[0].text);
  return result;
}

function cli(cwd, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout);
  return result.stdout.trimEnd().split('\n');
}

describe('a checkout whose upstream holds a different map it has not got', () => {
  it('answers from its own map, and the provenance names the upstream and the ref to pass', async () => {
    const before_ = checkoutSnapshot(stale.clone);
    for (const [name, args] of [['atlas_explain', { path: 'lib/core.js' }], ['atlas_overview', {}], ['atlas_test_gaps', {}]]) {
      const result = await ask(stale.clone, name, args);
      const { atlas } = result.structuredContent;
      assert.equal(atlas.map.snapshot, 'committed', name);
      assert.equal(atlas.map.commit, stale.mapped, name);
      assert.deepEqual(atlas.upstream, { name: 'origin/main', commit: second, ahead: 2, behind: 0, mapDiffers: true }, name);
      assert.match(atlas.line, SAID, name);
      assert.match(result.content[0].text.split('\n')[0], SAID, 'on the first line of the text');
    }
    const explained = cli(stale.clone, ['explain', 'lib/core.js']);
    assert.match(explained.at(-1), /^Map from commit [0-9a-f]{7}, \d{4}-\d\d-\d\d; origin\/main holds a different map, 2 commits ahead of this checkout: run with --ref origin\/main to answer from it\.$/);
    const gaps = cli(stale.clone, ['gaps']);
    assert.match(gaps.at(-1), /; origin\/main holds a different map, 2 commits ahead of this checkout: run with --ref origin\/main to answer from it\.$/);
    const json = JSON.parse(cli(stale.clone, ['explain', 'lib/core.js', '--json']).join('\n'));
    assert.deepEqual(json.upstream, { ahead: 2, behind: 0, commit: second, name: 'origin/main' });
    assert.deepEqual(changedRows(before_, checkoutSnapshot(stale.clone)), [], 'the checkout is as it was');
  });

  it('says nothing once the checkout holds the same map, nor when it is ahead with a map of its own', async () => {
    git(stale.clone, ['reset', '-q', '--hard', second]);
    let result = await ask(stale.clone, 'atlas_explain', { path: 'lib/core.js' });
    assert.equal(result.structuredContent.atlas.upstream, undefined);
    assert.doesNotMatch(result.structuredContent.atlas.line, /holds a different map/);
    assert.doesNotMatch(cli(stale.clone, ['explain', 'lib/core.js']).at(-1), /holds a different map/);

    appendFileSync(join(stale.clone, 'lib', 'other.js'), '// a local change\n');
    commitAll(stale.clone, 'local change');
    mapIn(stale.clone);
    commitAll(stale.clone, 'local map');
    result = await ask(stale.clone, 'atlas_explain', { path: 'lib/core.js' });
    assert.equal(result.structuredContent.atlas.upstream, undefined, 'an upstream the checkout is ahead of holds no newer map');
    assert.doesNotMatch(cli(stale.clone, ['gaps']).at(-1), /holds a different map/);
  });

  it('says nothing when the checkout has no upstream', async () => {
    const result = await ask(lone, 'atlas_explain', { path: 'lib/core.js' });
    assert.equal(result.structuredContent.atlas.upstream, undefined);
    assert.doesNotMatch(cli(lone, ['explain', 'lib/core.js']).at(-1), /holds a different map/);
  });
});
