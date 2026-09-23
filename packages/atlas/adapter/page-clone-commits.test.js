import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/clone-commits: three workflows commit into a clone of
// another repository (gh repo clone into /tmp, git clone into a directory of
// the workspace, actions/checkout of another repository), one commits here
// after moving between tracked directories, and one commits from a directory
// set at run time.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/clone-commits');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function door(name) {
  const found = structure.doors.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

function others() {
  const start = markdown.indexOf('## The other doors\n');
  assert.ok(start >= 0);
  const next = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, next).split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-clone-commits-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'clone-commits']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a commit made in a clone of another repository', () => {
  it('is recorded where it was made, and never as a stage of this repository', () => {
    for (const name of ['Broadcast', 'Mirror', 'Wiki', 'Scratch']) {
      assert.deepEqual(door(name).stages, [], name);
      assert.equal(door(name).pushes, false, name);
      assert.deepEqual(door(name).landings, [], name);
    }
    assert.deepEqual(door('Broadcast').elsewhere, [{ clone: 'acme/ledger', dir: '/tmp/ledger', pushes: true, stages: ['events/events.jsonl'] }]);
    assert.deepEqual(door('Mirror').elsewhere, [{ clone: 'acme/site', dir: 'site-mirror', pushes: true, stages: ['docs/'] }]);
    assert.deepEqual(door('Wiki').elsewhere, [{ clone: 'acme/wiki', dir: 'wiki', pushes: true, stages: ['pages/'] }]);
    assert.deepEqual(door('Scratch').elsewhere, [{ clone: null, dir: '$RUNNER_TEMP/scratch', pushes: true, stages: ['notes.txt'] }]);
  });

  it('reads a path staged after cd as a path of this repository when the directory is one', () => {
    assert.deepEqual(door('Local').stages, ['packages/app/build.json', 'records/']);
    assert.equal(door('Local').pushes, true);
    assert.deepEqual(door('Local').elsewhere, []);
  });

  it('says it commits into a clone of the repository it cloned, and says nothing of a clone it cannot name', () => {
    const lines = others();
    assert.ok(lines.includes('**Broadcast** runs no file this map can see and commits into a clone of acme/ledger and pushes there.'), lines.join('\n'));
    assert.ok(lines.includes('**Mirror** runs no file this map can see and commits into a clone of acme/site and pushes there.'), lines.join('\n'));
    assert.ok(lines.includes('**Wiki** runs no file this map can see and commits into a clone of acme/wiki and pushes there.'), lines.join('\n'));
    assert.ok(lines.includes('**Scratch** runs no file this map can see.'), lines.join('\n'));
    assert.ok(lines.includes('**Local** runs no file this map can see, writes to packages/app/build.json and records/, and commits packages/app/build.json and records/, then pushes.'), lines.join('\n'));
    assert.equal(markdown.includes('events/events.jsonl'), false);
    assert.equal(markdown.includes('MIRROR_TOKEN'), false);
  });
});
