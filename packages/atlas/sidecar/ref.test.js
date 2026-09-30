import { spawnSync } from 'node:child_process';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { changedRows, checkoutSnapshot } from '../core/checkout-state.js';
import { commitAll, git, staleClone } from './test-client.js';
import { assertInventsNothing, explainJson, mapAt } from './test-oracle.js';

/**
 * Atlas answers from the map a ref holds (docs/atlas-production.spec.md,
 * Part 1 item 1): a clone three commits behind a remote whose main holds a
 * map is asked with ref origin/main, and every tool that reads a map answers
 * from that map, says which ref answered, its commit and how far it is from
 * the checkout, and invents nothing the map at that ref does not state. Git
 * only reads; nothing is fetched; the checkout, .git included, is as it was.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-reach');
let stale;
let later;
let client;
let before_;

before(async () => {
  stale = staleClone(FIXTURE);
  // A branch past the map, whose lib/core.js now imports lib/other.js, and a
  // branch whose tree holds the map but whose history does not hold the
  // commit the map was made from.
  git(stale.work, ['checkout', '-q', '-b', 'later']);
  writeFileSync(join(stale.work, 'lib', 'core.js'), "import { writeFileSync } from 'node:fs';\nimport { label } from './other.js';\n\nexport function record(state) {\n  writeFileSync('data/state.json', `${label(state)}\\n`);\n}\n");
  commitAll(stale.work, 'core labels the state');
  later = git(stale.work, ['rev-parse', 'HEAD']);
  // The identity is given here, as commitAll gives it: a CI runner has none.
  const rewritten = git(stale.work, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit-tree', `${stale.tip}^{tree}`, '-m', 'rewritten']);
  git(stale.work, ['push', '-q', stale.remote, 'later', `${rewritten}:refs/heads/rewritten`]);
  git(stale.clone, ['fetch', '-q', 'origin']);
  appendFileSync(join(stale.clone, 'lib', 'other.js'), '// edited, not committed\n');
  before_ = checkoutSnapshot(stale.clone);
  client = new Client({ name: 'atlas-ref-test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, 'mcp'], cwd: stale.clone, stderr: 'pipe' }));
});

after(async () => {
  await client?.close();
  if (stale) rmSync(stale.base, { recursive: true, force: true });
});

function unchanged(label) {
  assert.deepEqual(changedRows(before_, checkoutSnapshot(stale.clone)), [], `after ${label}, the checkout is as it was`);
}

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  unchanged(`${name} ${JSON.stringify(args)}`);
  return result;
}

async function answered(name, args) {
  const result = await call(name, args);
  assert.notEqual(result.isError, true, result.content[0].text);
  return result;
}

function cli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: stale.clone, encoding: 'utf8' });
  unchanged(`atlas ${args.join(' ')}`);
  return { status: result.status, stdout: result.stdout, lines: result.stdout.trimEnd().split('\n') };
}

describe('the sidecar asked with a ref', () => {
  it('answers every map-reading tool from the map at the ref, and says which ref and how far', async () => {
    const source = mapAt(stale.clone, 'origin/main');
    const asked = [
      ['atlas_overview', {}],
      ['atlas_explain', { path: 'lib/core.js' }],
      ['atlas_explain', { path: 'data' }],
      ['atlas_reach', { paths: ['lib/core.js'] }],
      ['atlas_test_gaps', {}],
      ['atlas_test_gaps', { path: 'lib' }],
      ['atlas_changes', { since: 'origin/main' }],
    ];
    for (const [name, args] of asked) {
      const result = await answered(name, { ...args, ref: 'origin/main' });
      const { atlas, answer } = result.structuredContent;
      assert.deepEqual(atlas.ref, { name: 'origin/main', commit: stale.tip, ahead: 3, behind: 0, workingTreeCompared: false }, name);
      assert.equal(atlas.map.commit, stale.mapped, name);
      assert.equal(atlas.map.snapshot, `ref:${stale.tip}`, name);
      assert.match(atlas.line, new RegExp(`· map ${stale.mapped.slice(0, 7)} from origin/main, 3 commits ahead of this checkout, \\d{4}-\\d\\d-\\d\\d, made by Atlas `), name);
      assert.match(result.content[0].text, /files are read at origin\/main, and this checkout's working tree was not compared\./, name);
      // The clone's own uncommitted edit is not compared with a map read at a ref.
      assert.deepEqual(atlas.checkout.changed, [], name);
      if (name === 'atlas_explain') assertInventsNothing(name, answer, source, { explained: explainJson(stale.clone, args.path, ['--ref', 'origin/main']) });
      else if (name === 'atlas_overview' || name === 'atlas_reach') assertInventsNothing(name, answer, source);
      else if (name === 'atlas_changes') assertInventsNothing(name, answer, source, { base: source.structure });
    }
  });

  it('judges a file changed between the map and the ref, and reads it again as the ref holds it', async () => {
    const result = await answered('atlas_explain', { path: 'lib/core.js', ref: 'origin/later' });
    const { atlas, answer } = result.structuredContent;
    assert.deepEqual(atlas.ref, { name: 'origin/later', commit: later, ahead: 4, behind: 0, workingTreeCompared: false });
    assert.deepEqual(atlas.checkout.changed, [{ path: 'lib/core.js', committed: true, uncommitted: false }]);
    assert.match(atlas.line, /lib\/core\.js changed after the map \(committed before origin\/later\)/);
    assert.match(result.content[0].text, /1 file in this answer changed between the map's commit and origin\/later/);
    const reread = answer.facts.filter((entry) => entry.source === 're-read' && entry.fact === 'importsFiles');
    assert.deepEqual(reread.flatMap((entry) => entry.items), ['lib/other.js'], 'the file is read as origin/later holds it, not as the working tree does');
  });

  it('refuses atlas_check_change with a ref whose map this checkout does not hold, and says why', async () => {
    const result = await call('atlas_check_change', { ref: 'origin/main' });
    assert.equal(result.isError, true);
    const { error } = result.structuredContent;
    assert.equal(error.code, 'ATLAS_SIDECAR_MAP_FOREIGN');
    assert.match(error.whatChanged[0], /atlas_check_change compares this checkout's working tree with the map/);
    assert.match(error.whatToDo, /the other tools answer from origin\/main as it is/);
  });

  it('refuses a ref that names nothing, one shaped like an option, one holding no map, and one whose map is not in its history', async () => {
    const unknown = await call('atlas_explain', { path: 'lib/core.js', ref: 'origin/no-such-branch' });
    assert.equal(unknown.structuredContent.error.code, 'ATLAS_REF_UNKNOWN');
    const option = await call('atlas_explain', { path: 'lib/core.js', ref: '--output=x' });
    assert.equal(option.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
    const mapless = await call('atlas_overview', { ref: 'HEAD' });
    assert.equal(mapless.structuredContent.error.code, 'ATLAS_SIDECAR_NO_MAP');
    assert.match(mapless.structuredContent.error.whatChanged[0], /^HEAD \([0-9a-f]{7}\) holds no atlas\/structure\.json$/);
    const foreign = await call('atlas_overview', { ref: 'origin/rewritten' });
    assert.equal(foreign.structuredContent.error.code, 'ATLAS_REF_MAP_FOREIGN');
  });

  it('lists ref among the arguments of every tool but atlas_refresh', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) assert.equal('ref' in tool.inputSchema.properties, tool.name !== 'atlas_refresh', tool.name);
  });
});

describe('atlas explain and atlas gaps with --ref', () => {
  it('answer from the map at the ref, and say so on the last line', () => {
    const explained = cli(['explain', 'lib/core.js', '--ref', 'origin/main']);
    assert.equal(explained.status, 0, explained.stdout);
    assert.match(explained.lines.at(-1), /^Map from commit [0-9a-f]{7}, \d{4}-\d\d-\d\d, read at origin\/main, 3 commits ahead of this checkout\.$/);
    const gaps = cli(['gaps', '--ref', 'origin/main']);
    assert.equal(gaps.status, 0, gaps.stdout);
    assert.match(gaps.lines.at(-1), /^Map from commit [0-9a-f]{7}, \d{4}-\d\d-\d\d, read at origin\/main, 3 commits ahead of this checkout\.$/);
  });

  it('state the same facts as the map at the ref, with the ref as a field', () => {
    const atRef = explainJson(stale.clone, 'lib/core.js', ['--ref', 'origin/main']);
    const { ref, ...facts } = atRef;
    assert.deepEqual(ref, { ahead: 3, behind: 0, commit: stale.tip, name: 'origin/main' });
    git(stale.work, ['checkout', '-q', 'main']);
    assert.deepEqual(facts, explainJson(stale.work, 'lib/core.js'), 'what the clone is told at origin/main is what the mapped checkout is told');
    const gaps = cli(['gaps', 'lib', '--ref', 'origin/main', '--json']);
    assert.equal(gaps.status, 0, gaps.stdout);
    assert.deepEqual(JSON.parse(gaps.stdout).ref, { name: 'origin/main', commit: stale.tip, ahead: 3, behind: 0 });
  });

  it('refuse a ref in the error shape, and a flag with no ref as a usage line', () => {
    const unknown = cli(['explain', 'lib/core.js', '--ref', 'origin/no-such-branch']);
    assert.equal(unknown.status, 2);
    assert.equal(unknown.lines[0], 'ATLAS_REF_UNKNOWN  The ref names no commit in this clone.');
    const missing = cli(['gaps', '--ref']);
    assert.equal(missing.status, 2);
    assert.equal(missing.lines[0], 'atlas: --ref needs a ref, such as --ref origin/main');
    const mapless = cli(['explain', 'lib/core.js', '--ref', 'HEAD']);
    assert.equal(mapless.status, 2);
    assert.equal(mapless.lines[0], 'ATLAS_EXPLAIN_NO_MAP  There is no committed map to explain from.');
  });
});
