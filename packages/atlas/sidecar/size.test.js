import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { commitAll, git, mapIn, modernMeta, startServer } from './test-client.js';

/**
 * The size of an answer: at most 8 KB of JSON, the whole response line
 * included, and up to 64 KB with full: true; lists most important first; a
 * cut list says so with complete: false, its count and a cursor that
 * continues it; part and kind narrow the answer. The repository is the
 * sidecar-size fixture with three hundred files that import core/hub.js and
 * a hundred tests that do, written by the test so the fixture stays small.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-size');
const CAP = 8 * 1024;
const FULL_CAP = 64 * 1024;
const CURSOR = /^[0-9a-f]{16}:[A-Za-z0-9.]+:[0-9]+$/;
const USERS = 300;
const TESTS = 100;
// Facts about doors, which come before facts about files.
const DOOR_FACTS = new Set(['door', 'doors', 'runBy', 'builtBy', 'checkedBy', 'onPath', 'runs', 'checks', 'reachedThrough',
  'passesThrough', 'reaches', 'doorWrites', 'writtenByDoors', 'mainDoor', 'startDoor']);
let repo;
let server;

function pad(n) {
  return String(n).padStart(3, '0');
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'atlas-size-'));
  cpSync(FIXTURE, repo, { recursive: true });
  mkdirSync(join(repo, 'users'));
  mkdirSync(join(repo, 'test'));
  for (let i = 0; i < USERS; i += 1) {
    writeFileSync(join(repo, 'users', `u${pad(i)}.js`), `import { hub } from '../core/hub.js';\n\nexport const u${pad(i)} = hub;\n`);
  }
  for (let i = 0; i < TESTS; i += 1) {
    writeFileSync(join(repo, 'test', `t${pad(i)}.test.js`), "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\nimport { hub } from '../core/hub.js';\n\ntest('hub', () => assert.equal(hub, 'hub'));\n");
  }
  git(repo, ['init', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  commitAll(repo, 'fixture');
  mapIn(repo);
  commitAll(repo, 'map');
  server = startServer({ cwd: repo });
});

after(async () => {
  await server?.close();
  if (repo) rmSync(repo, { recursive: true, force: true });
});

/** A tools/call on the raw stdio client: the result, and the size of the whole response line. */
async function call(name, args) {
  const response = await server.request('tools/call', { name, arguments: args, _meta: modernMeta() });
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  return { result: response.result, bytes: Buffer.byteLength(JSON.stringify(response)) };
}

async function answer(name, args) {
  const { result, bytes } = await call(name, args);
  assert.notEqual(result.isError, true, result.content[0].text);
  return { ...result.structuredContent, text: result.content[0].text, bytes };
}

function groupOf(facts, fact, { tests = false } = {}) {
  return facts.find((group) => group.fact === fact && (group.tests === true) === tests);
}

// The same list in two answers to the same question.
function sameList(a, b) {
  return a.fact === b.fact && a.basis === b.basis && (a.tests === true) === (b.tests === true)
    && (a.followed !== false) === (b.followed !== false) && a.grain === b.grain && a.file === b.file;
}

function band(group) {
  if (group.followed === false) return 2;
  return group.tests ? 1 : 0;
}

/**
 * Every list the answer cut says so, and every fact list is ordered most
 * important first: production before tests before what is not followed,
 * and doors before files within each.
 */
function assertMarked(label, found) {
  for (const group of found.answer.facts) {
    const shown = group.items.length;
    const from = group.from ?? 0;
    if (from > 0 || shown < group.total) {
      assert.equal(group.complete, false, `${label}: ${group.fact} shows ${shown} of ${group.total} and says it is cut`);
      if (from + shown < group.total) assert.match(group.cursor, CURSOR, `${label}: ${group.fact} has a cursor for the rest`);
    } else {
      assert.equal(group.complete, true, `${label}: ${group.fact} is whole`);
    }
  }
  const lists = [[found.answer, 'facts'], [found.answer, 'cannotSee'], [found.answer, 'changed'], [found.atlas.checkout ?? {}, 'changed']];
  for (const entry of found.answer.cannotSee) lists.push([entry, 'named']);
  for (const [holder, key] of lists) {
    if (!Array.isArray(holder[key])) continue;
    const total = holder[`${key}Total`];
    if (typeof total === 'number' && holder[key].length < total) {
      assert.equal(holder[`${key}Complete`], false, `${label}: ${key} shows ${holder[key].length} of ${total} and says it is cut`);
    }
    if (holder[`${key}Complete`] === false) assert.equal(typeof total, 'number', `${label}: a cut ${key} carries its count`);
  }
  const bands = found.answer.facts.map(band);
  assert.deepEqual(bands, [...bands].sort((a, b) => a - b), `${label}: production, then tests, then what is not followed`);
  for (const value of new Set(bands)) {
    const within = found.answer.facts.filter((group) => band(group) === value);
    const lastDoor = within.map((group) => DOOR_FACTS.has(group.fact)).lastIndexOf(true);
    const firstFile = within.findIndex((group) => group.grain === 'file');
    if (lastDoor !== -1 && firstFile !== -1) assert.ok(lastDoor < firstFile, `${label}: doors before files`);
  }
}

describe('the size of an answer', () => {
  it('cuts a part with hundreds of importers to 8 KB, with the count and a cursor, most important first', async () => {
    const cut = await answer('atlas_reach', { paths: ['core'] });
    assert.ok(cut.bytes <= CAP, `the whole response is ${cut.bytes} bytes`);
    const production = groupOf(cut.answer.facts, 'importedBy');
    const tests = groupOf(cut.answer.facts, 'importedBy', { tests: true });
    assert.equal(production.total, USERS);
    assert.equal(tests.total, TESTS);
    for (const group of [production, tests]) {
      assert.equal(group.complete, false);
      assert.ok(group.items.length > 0 && group.items.length < group.total, `${group.items.length} of ${group.total} shown`);
      assert.match(group.cursor, CURSOR);
    }
    assert.ok(cut.answer.facts.indexOf(production) < cut.answer.facts.indexOf(tests), 'production before tests');
    assertMarked('atlas_reach core', cut);
    // The cut is said first, in the text a model reads.
    const [, first] = cut.text.split('\n');
    assert.match(first, /^Atlas: this answer is cut to fit 8 KB, most important first: .*importedBy \d+ of 300/);

    // What is kept is the head of the whole list, not a sample of it.
    const whole = await answer('atlas_reach', { paths: ['core'], full: true });
    assert.ok(whole.bytes > CAP && whole.bytes <= FULL_CAP, `full: true gives ${whole.bytes} bytes`);
    for (const group of whole.answer.facts) assert.equal(group.complete, true, `${group.fact} is whole with full: true`);
    for (const group of cut.answer.facts) {
      const full = whole.answer.facts.find((entry) => sameList(entry, group));
      assert.ok(full, `${group.fact} is in the whole answer`);
      assert.equal(group.total, full.total);
      assert.deepEqual(group.items, full.items.slice(0, group.items.length), `${group.fact} keeps the first entries`);
    }
  });

  it('continues a cut list with its cursor to the end, each answer within the cap, losing nothing', async () => {
    const whole = groupOf((await answer('atlas_explain', { path: 'core/hub.js', full: true })).answer.facts, 'importedByFiles');
    assert.equal(whole.items.length, USERS);
    let found = await answer('atlas_explain', { path: 'core/hub.js' });
    let list = groupOf(found.answer.facts, 'importedByFiles');
    const seen = [...list.items];
    let pages = 1;
    while (list.cursor) {
      const offset = Number(list.cursor.split(':').pop());
      assert.equal(offset, seen.length, 'the cursor continues where the list was cut');
      found = await answer('atlas_explain', { path: 'core/hub.js', cursor: list.cursor });
      assert.ok(found.bytes <= CAP, `page ${pages + 1} is ${found.bytes} bytes`);
      list = groupOf(found.answer.facts, 'importedByFiles');
      assert.equal(list.from, offset);
      assert.equal(list.complete, false, 'a list shown from its middle is not whole');
      assert.match(found.text.split('\n')[1], new RegExp(`^Atlas: this answer continues importedByFiles from entry ${offset + 1}: `));
      assertMarked(`page ${pages + 1}`, found);
      seen.push(...list.items);
      pages += 1;
      assert.ok(pages < 100, 'the pages end');
    }
    assert.ok(pages > 1, 'the list took more than one answer');
    assert.deepEqual(seen, whole.items, 'the pages hold the whole list, in order, once');
  });

  it('narrows the answer to a part, or to a kind of fact, and says so', async () => {
    const inTests = await answer('atlas_reach', { paths: ['core'], part: 'test', full: true });
    assert.deepEqual(inTests.answer.filter.part, 'test');
    assert.ok(inTests.answer.filter.left >= USERS, 'the importers in other parts are left out, and counted');
    const importers = inTests.answer.facts.filter((group) => group.fact === 'importedBy');
    assert.deepEqual(importers.map((group) => group.tests === true), [true], 'only the tests import core from the test part');
    assert.equal(importers[0].total, TESTS);
    assert.ok(importers[0].items.every((item) => item.path.startsWith('test/')));
    assert.match(inTests.text.split('\n')[1], /^Atlas: narrowed to part test; \d+ entries that do not match are left out\.$/);

    const kind = await answer('atlas_explain', { path: 'core/hub.js', kind: 'importedByFiles' });
    assert.deepEqual([...new Set(kind.answer.facts.map((group) => group.fact))], ['importedByFiles']);
    assert.ok(kind.answer.cannotSee !== undefined, 'what Atlas cannot see travels with every kind');
    const blind = await answer('atlas_explain', { path: 'core/hub.js', kind: 'cannotSee' });
    assert.deepEqual(blind.answer.facts, []);
    const none = await answer('atlas_explain', { path: 'core/hub.js', kind: 'noSuchKind' });
    assert.deepEqual(none.answer.facts, []);
    assert.match(none.text, /this answer has no fact of kind noSuchKind; its kinds are [a-zA-Z, ]+, and cannotSee\./);

    const unknown = await call('atlas_reach', { paths: ['core'], part: 'nowhere' });
    assert.equal(unknown.result.isError, true);
    assert.equal(unknown.result.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
  });

  it('keeps every answer within its cap and marks every list it cut', async () => {
    const questions = [
      ['atlas_overview', {}],
      ['atlas_explain', { path: 'core/hub.js' }],
      ['atlas_explain', { path: 'core' }],
      ['atlas_explain', { path: 'users' }],
      ['atlas_reach', { paths: ['core/hub.js', 'users/u000.js'] }],
    ];
    for (const [name, args] of questions) {
      const cut = await answer(name, args);
      assert.ok(cut.bytes <= CAP, `${name} ${JSON.stringify(args)}: ${cut.bytes} bytes`);
      assertMarked(`${name} ${JSON.stringify(args)}`, cut);
      const whole = await answer(name, { ...args, full: true });
      assert.ok(whole.bytes <= FULL_CAP, `${name} with full: true: ${whole.bytes} bytes`);
      assertMarked(`${name} ${JSON.stringify(args)} full`, whole);
    }
  });

  it('cuts the changed files and the tests of a change the same way', async () => {
    const changed = ['core/hub.js', ...Array.from({ length: 60 }, (_, i) => `users/u${pad(i)}.js`)];
    for (const path of changed) {
      const body = path.startsWith('core/') ? "export const hub = 'hub';\n" : "import { hub } from '../core/hub.js';\n\nexport const user = hub;\n";
      writeFileSync(join(repo, path), `${body}// changed\n`);
    }
    try {
      const cut = await answer('atlas_check_change', {});
      assert.ok(cut.bytes <= CAP, `${cut.bytes} bytes`);
      assert.equal(cut.answer.changedTotal, changed.length, 'the changed files are counted');
      assert.equal(cut.answer.changedComplete, false);
      assert.match(cut.answer.changedCursor, CURSOR);
      assert.equal(groupOf(cut.answer.facts, 'tests').total, TESTS);
      assertMarked('atlas_check_change', cut);
      const whole = await answer('atlas_check_change', { full: true });
      assert.equal(whole.answer.changed.length, changed.length);
      assert.deepEqual(cut.answer.changed, whole.answer.changed.slice(0, cut.answer.changed.length), 'the first changed files are kept');
    } finally {
      git(repo, ['checkout', '--', 'core', 'users']);
    }
  });

  it('refuses a cursor for another question, a cursor it did not give, and one for a map that is gone', async () => {
    const reach = groupOf((await answer('atlas_reach', { paths: ['core'] })).answer.facts, 'importedBy');
    const other = await call('atlas_reach', { paths: ['core/hub.js'], cursor: reach.cursor });
    assert.equal(other.result.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
    assert.match(other.result.structuredContent.error.whatChanged[0], /another question/);
    const elsewhere = await call('atlas_explain', { path: 'core/hub.js', cursor: reach.cursor });
    assert.equal(elsewhere.result.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
    const shaped = await call('atlas_reach', { paths: ['core'], cursor: 'not a cursor' });
    assert.equal(shaped.result.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
    const past = await call('atlas_reach', { paths: ['core'], cursor: reach.cursor.replace(/:[0-9]+$/, ':999999') });
    assert.equal(past.result.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');

    // A new map committed: the cursor named the old one.
    writeFileSync(join(repo, 'users', 'u000.js'), "import { hub } from '../core/hub.js';\n\nexport const u000 = `${hub}!`;\n");
    commitAll(repo, 'change a user');
    mapIn(repo);
    commitAll(repo, 'map again');
    const stale = await call('atlas_reach', { paths: ['core'], cursor: reach.cursor });
    assert.equal(stale.result.isError, true);
    assert.equal(stale.result.structuredContent.error.code, 'ATLAS_SIDECAR_CURSOR_STALE');

    // What changed between the two maps is cut and marked like any answer.
    const changes = await answer('atlas_changes', { since: 'HEAD~2' });
    assert.ok(changes.bytes <= CAP);
    assertMarked('atlas_changes', changes);
  });
});
