import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/caller-paths: a command people run that writes into the
// directory it is run in, a directory it is handed that defaults to ".", and
// the home directory, beside a tracked data/ and node.json of the same names;
// a Python tool that does the same through pathlib and os; and a script a
// workflow runs from the repository root that writes into data/ here.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/caller-paths');
const roots = [];
let structure;
let page;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function writers(target) {
  return (structure.landings.find((landing) => landing.target === target)?.writers ?? []).map((entry) => entry.by);
}

function part(name) {
  return structure.boundaries.find((boundary) => boundary.name === name);
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-caller-paths-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'caller-paths']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a path relative to the caller or the home directory', () => {
  it('never lands a command\'s writes on the tracked places that share their names', () => {
    for (const target of ['data', 'data/x.json', 'data/cache.json', 'node.json', '.gitignore']) {
      assert.ok(!writers(target).includes('bin/stash.js'), `${target}: ${writers(target)}`);
    }
    const door = structure.doors.find((item) => item.kind === 'command' && item.name === 'stash');
    assert.deepEqual(door.landings, []);
  });

  it('never lands a write built from the home directory or os.getcwd, even from a script a workflow runs', () => {
    assert.deepEqual(writers('data/stamp.txt'), []);
    assert.deepEqual(writers('data'), []);
  });

  it('keeps a bare path in a script a workflow runs from the repository root', () => {
    assert.deepEqual(writers('data/catalog.json'), ['scripts/build-catalog.mjs']);
    const door = structure.doors.find((item) => item.file === '.github/workflows/catalog.yml');
    assert.deepEqual(door.landings, ['data/catalog.json']);
  });

  it('counts what goes outside by part and says so under the limits', () => {
    assert.equal(part('bin').outsideWrites, 6);
    assert.equal(part('bin').outsideReads, 1);
    assert.equal(part('tools').outsideWrites, 3);
    assert.ok(
      page.limits.includes('9 writes and 1 read go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.'),
      page.limits.join('\n'),
    );
  });

  it('lists none of those places as generated', () => {
    const generated = page.generated.map((item) => item.place);
    assert.deepEqual(generated, ['data/'], markdown);
  });
});
