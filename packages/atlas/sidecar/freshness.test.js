import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { commitAll, git, mapIn, mappedRepository, modernMeta, startServer } from './test-client.js';

/**
 * How fresh an answer's map is, said in every answer: when files in it
 * changed after the map (committed or not), when an older, newer or unnamed
 * engine made the map, with the refresh named; and, for a file asked about
 * that changed, a re-read of it by the engine's own per-file code, marked
 * re-read and set beside the map's view.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-basis');
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const scratch = [];

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

function fresh() {
  const root = mappedRepository(FIXTURE, { prefix: 'atlas-freshness-' });
  scratch.push(root);
  return root;
}

async function explain(root, path) {
  const server = startServer({ cwd: root });
  const response = await server.request('tools/call', { name: 'atlas_explain', arguments: { path }, _meta: modernMeta() });
  await server.close();
  assert.ok(response.result, JSON.stringify(response));
  return response.result;
}

// The store's change after the map: it imports the scratch module and
// writes a second tracked file.
const EDIT = "import { scratch } from './scratch.js';\nexport function audit(entry) {\n  scratch();\n  writeFileSync('data/latest.json', JSON.stringify(entry));\n}\n";

function rereadGroups(result) {
  return result.structuredContent.answer.facts.filter((entry) => entry.source === 're-read');
}

function setEngine(root, engine) {
  const path = join(root, 'atlas', 'structure.json');
  const structure = JSON.parse(readFileSync(path, 'utf8'));
  if (engine == null) delete structure.engine;
  else structure.engine = engine;
  writeFileSync(path, `${JSON.stringify(structure, null, 2)}\n`);
  commitAll(root, 'restamp the map');
}

describe('files that changed after the map', () => {
  it('says a file changed after the map, committed, once HEAD moved past it, and names the refresh', async () => {
    const root = fresh();
    appendFileSync(join(root, 'lib', 'store.js'), EDIT);
    commitAll(root, 'store audits');
    const result = await explain(root, 'lib/store.js');
    assert.deepEqual(result.structuredContent.atlas.checkout.changed, [{ path: 'lib/store.js', committed: true, uncommitted: false }]);
    const text = result.content[0].text;
    assert.match(text.split('\n')[0], / · lib\/store\.js changed after the map \(committed\)$/);
    assert.match(text, /^Atlas: 1 file in this answer changed after the map, so what the map says of it is from before the change; atlas_refresh re-maps the checkout\.$/m);
  });

  it('says an edit not yet committed is uncommitted', async () => {
    const root = fresh();
    appendFileSync(join(root, 'lib', 'store.js'), EDIT);
    const result = await explain(root, 'lib/store.js');
    assert.deepEqual(result.structuredContent.atlas.checkout.changed, [{ path: 'lib/store.js', committed: false, uncommitted: true }]);
    assert.match(result.content[0].text.split('\n')[0], / · lib\/store\.js changed after the map \(uncommitted\)$/);
  });

  it('does not call a change the map already holds a change after the map', async () => {
    const root = fresh();
    // Mapped on a working tree and committed with the change it describes.
    appendFileSync(join(root, 'lib', 'store.js'), EDIT);
    mapIn(root);
    commitAll(root, 'store audits, and the map');
    const result = await explain(root, 'lib/store.js');
    assert.deepEqual(result.structuredContent.atlas.checkout.changed, []);
    assert.deepEqual(rereadGroups(result), []);
  });

  it('reads a changed file again and sets what it does now beside the map', async () => {
    const root = fresh();
    appendFileSync(join(root, 'lib', 'store.js'), EDIT);
    const result = await explain(root, 'lib/store.js');
    const { facts, cannotSee } = result.structuredContent.answer;
    // The map's view is unchanged: no import of a file of this repository.
    assert.equal(facts.some((entry) => entry.fact === 'importsFiles' && entry.source !== 're-read'), false);
    const reread = rereadGroups(result);
    assert.deepEqual(reread.map((entry) => [entry.fact, entry.basis, entry.file, entry.items]), [
      ['importsFiles', 'parsed', 'lib/store.js', ['lib/scratch.js']],
      ['writes', 'parsed', 'lib/store.js', ['data/latest.json']],
    ]);
    const unseen = cannotSee.filter((entry) => entry.source === 're-read');
    assert.deepEqual(unseen.find((entry) => entry.what === 'import'), {
      basis: 'unresolved', what: 'import', grain: 'file', count: 1,
      named: [{ path: 'lib/store.js', specifier: 'left-pad', why: 'undeclared' }], source: 're-read',
    });
    assert.ok(unseen.some((entry) => entry.basis === 'outside' && entry.where === 'temporary' && entry.grain === 'file'), JSON.stringify(unseen));
    assert.match(result.content[0].text, /^Atlas: read again now, lib\/store\.js imports lib\/scratch\.js; writes data\/latest\.json \(re-read; the map's view above is from the map\)\.$/m);
  });

  it('reads the status without writing .git/index, where a plain git status would', async () => {
    const root = fresh();
    // A tracked file whose times moved and bytes did not: git status refreshes
    // the index's record of it, and writes the index, unless told not to.
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(root, 'lib', 'store.js'), later, later);
    const index = join(root, '.git', 'index');
    const before = { bytes: readFileSync(index), mtimeMs: statSync(index).mtimeMs };
    await explain(root, 'lib/store.js');
    assert.equal(Buffer.compare(readFileSync(index), before.bytes), 0, '.git/index kept its bytes');
    assert.equal(statSync(index).mtimeMs, before.mtimeMs, '.git/index kept its time');
    spawnSync('git', ['status', '--porcelain'], { cwd: root });
    assert.notEqual(Buffer.compare(readFileSync(index), before.bytes), 0, 'the same status without GIT_OPTIONAL_LOCKS=0 rewrites the index, so the check can fail');
  });
});

describe('the engine that made the map', () => {
  it('says so when an older engine made it, and names the refresh', async () => {
    const root = fresh();
    setEngine(root, '1.0.0');
    const result = await explain(root, 'lib/store.js');
    assert.equal(result.structuredContent.atlas.map.engineAge, 'older');
    assert.match(result.content[0].text, new RegExp(`^Atlas: the map was made by Atlas 1\\.0\\.0, an older engine than this one \\(${VERSION.replaceAll('.', '\\.')}\\); atlas_refresh re-maps the checkout with this engine\\.$`, 'm'));
    assert.match(result.structuredContent.atlas.line, /made by Atlas 1\.0\.0/);
  });

  it('says so when the map names no engine, and when a newer one made it', async () => {
    const unnamed = fresh();
    setEngine(unnamed, null);
    const old = await explain(unnamed, 'lib/store.js');
    assert.equal(old.structuredContent.atlas.map.engineAge, 'unknown');
    assert.match(old.content[0].text, /^Atlas: the map does not name the engine that made it, so it was made before maps recorded one; atlas_refresh re-maps the checkout with this engine \(/m);
    const newer = fresh();
    setEngine(newer, '99.0.0');
    const ahead = await explain(newer, 'lib/store.js');
    assert.equal(ahead.structuredContent.atlas.map.engineAge, 'newer');
    assert.match(ahead.content[0].text, /^Atlas: the map was made by Atlas 99\.0\.0, newer than this engine/m);
  });

  it('says nothing of the engine when this engine made the map', async () => {
    const root = fresh();
    const result = await explain(root, 'lib/store.js');
    assert.equal(result.structuredContent.atlas.map.engineAge, 'same');
    assert.doesNotMatch(result.content[0].text, /engine than this one|names? no engine|newer than this engine/);
    assert.equal(git(root, ['status', '--porcelain']), '');
  });
});
