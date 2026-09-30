import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { commitAll, git, mapIn, modernMeta, startServer } from './test-client.js';

/**
 * A cut inner list carries a cursor (docs/atlas-production.spec.md, Part 6).
 * An entry too large to share an answer's room (a door that runs two
 * hundred scripts) has its longest lists cut inside it. Each such list says
 * it is cut and gives a cursor, which a follow-up call takes as it takes an
 * outer list's: the entry is shown again with that list continued, each page
 * within the 8 KB cap, until the list ends, no entry repeated or skipped.
 * The repository is written by the test, so no fixture holds the scripts.
 */

const CAP = 8 * 1024;
const SCRIPTS = 200;
const CURSOR = /^[0-9a-f]{16}:f[0-9]+\.e[0-9]+\.runs:[0-9]+$/;
let repo;
let server;

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'atlas-inner-'));
  mkdirSync(join(repo, 'atlas'));
  mkdirSync(join(repo, 'scripts'));
  mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(repo, 'atlas', 'boundaries.yaml'), 'boundaries:\n  - name: scripts\n    globs:\n      - scripts/**\n    role: code\n  - name: workflows\n    globs:\n      - .github/**\n    role: config\n');
  const names = Array.from({ length: SCRIPTS }, (_, i) => `scripts/nightly-maintenance-task-${String(i).padStart(3, '0')}.js`);
  for (const name of names) writeFileSync(join(repo, name), 'export {};\n');
  writeFileSync(join(repo, '.github', 'workflows', 'ci.yml'), `name: CI\non: push\njobs:\n  all:\n    runs-on: ubuntu-latest\n    steps:\n${names.map((name) => `      - run: node ${name}\n`).join('')}`);
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

async function answer(args) {
  const response = await server.request('tools/call', { name: 'atlas_overview', arguments: args, _meta: modernMeta() });
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  assert.notEqual(response.result.isError, true, response.result.content[0].text);
  return { ...response.result.structuredContent, text: response.result.content[0].text, bytes: Buffer.byteLength(JSON.stringify(response)) };
}

function ciDoor(found) {
  const doors = found.answer.facts.find((group) => group.fact === 'doors');
  assert.ok(doors, 'the answer holds the doors');
  const door = doors.items.find((item) => item && item.name === 'CI');
  assert.ok(door, 'the doors hold CI');
  return door;
}

describe('a cut inner list', () => {
  it('pages to its end through cursors, each page within the cap, no entry repeated or skipped', async () => {
    const whole = ciDoor(await answer({ full: true })).runs;
    assert.equal(whole.length, SCRIPTS, 'full: true holds every run');

    let found = await answer({});
    let door = ciDoor(found);
    assert.equal(door.runsComplete, false, 'the cut list says it is cut');
    assert.match(door.runsCursor, CURSOR);
    assert.equal(door.runsCount, SCRIPTS, 'the entry counts the whole list');
    const seen = [...door.runs];
    let pages = 1;
    while (door.runsCursor) {
      const offset = Number(door.runsCursor.split(':').pop());
      assert.equal(offset, seen.length, 'the cursor continues where the list was cut');
      found = await answer({ cursor: door.runsCursor });
      assert.ok(found.bytes <= CAP, `page ${pages + 1} is ${found.bytes} bytes`);
      door = ciDoor(found);
      assert.equal(door.runsFrom, offset, 'the page says where it starts');
      assert.equal(door.runsComplete, false, 'a list shown from its middle is not whole');
      assert.match(found.text.split('\n')[1], new RegExp(`^Atlas: this answer continues runs of CI in doors from entry ${offset + 1}: `));
      seen.push(...door.runs);
      pages += 1;
      assert.ok(pages < 100, 'the pages end');
    }
    assert.ok(pages > 1, 'the list took more than one answer');
    assert.deepEqual(seen, whole, 'the pages hold the whole list, in order, once');
  });

  it('gives the same cursors for the same question', async () => {
    const first = ciDoor(await answer({}));
    const again = ciDoor(await answer({}));
    assert.equal(again.runsCursor, first.runsCursor);
  });

  it('refuses a cursor past the end of the inner list, or into an entry that has no such list', async () => {
    const door = ciDoor(await answer({}));
    const past = await server.request('tools/call', { name: 'atlas_overview', arguments: { cursor: door.runsCursor.replace(/:[0-9]+$/, ':9999') }, _meta: modernMeta() });
    assert.equal(past.result.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
    const nowhere = await server.request('tools/call', { name: 'atlas_overview', arguments: { cursor: door.runsCursor.replace(/\.runs:/, '.nosuch:') }, _meta: modernMeta() });
    assert.equal(nowhere.result.structuredContent.error.code, 'ATLAS_SIDECAR_INVALID_ARGUMENTS');
  });
});
