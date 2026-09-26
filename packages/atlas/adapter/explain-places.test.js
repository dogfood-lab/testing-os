import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/explain-places');
const MAP_LINE = /^Map from commit [0-9a-f]{7}, \d{4}-\d{2}-\d{2}\.$/;

let root;

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function explain(...args) {
  const result = spawnSync(process.execPath, [CLI, 'explain', ...args], { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, lines: result.stdout.trimEnd().split('\n') };
}

function explained(...args) {
  const result = explain(...args);
  assert.equal(result.status, 0, result.stdout);
  return result.lines;
}

function facts(...args) {
  const result = explain(...args, '--json');
  assert.equal(result.status, 0, result.stdout);
  return JSON.parse(result.stdout);
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-explain-places-'));
  cpSync(FIXTURE, root, { recursive: true });
  git(['init', '-q']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '-A']);
  git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'fixture']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('atlas explain for a place', () => {
  it('says who writes a directory and who reads what is in it', () => {
    const lines = explained('store');
    assert.equal(lines[0], 'store/ is a directory; its one file is in store (data), the part explained here.');
    assert.ok(lines.includes('Written by lib/ledger.js (into store/ledger/).'), lines.join('\n'));
    assert.ok(lines.includes('Read by site/index.html (found by text), test/ledger.test.js (from tests) and tools/summary.js.'), lines.join('\n'));
    assert.ok(lines.includes('Ledger writes to it.'), lines.join('\n'));
    assert.match(lines.at(-1), MAP_LINE);
  });

  it('says a file is written as part of the directory a writer writes', () => {
    const lines = explained('store/ledger/latest.json');
    assert.ok(lines.includes('Written by lib/ledger.js (which writes store/ledger/).'), lines.join('\n'));
    assert.ok(lines.includes('Read by site/index.html (found by text), test/ledger.test.js (from tests) and tools/summary.js.'), lines.join('\n'));
  });

  it('gives the same writers and readers in JSON', () => {
    const place = facts('store');
    assert.deepEqual(place.writtenBy, [{ by: 'lib/ledger.js', place: 'store/ledger/', relation: 'inside' }]);
    assert.deepEqual(place.readBy, [
      { by: 'site/index.html', text: true },
      { by: 'test/ledger.test.js', fromTests: true },
      { by: 'tools/summary.js' },
    ]);
    assert.deepEqual(place.writtenByDoors, ['Ledger']);
    const file = facts('store/ledger/latest.json');
    assert.deepEqual(file.writtenBy, [{ by: 'lib/ledger.js', place: 'store/ledger/', relation: 'parent' }]);
  });

  it('leaves a file no one writes or reads with empty lists and no place lines', () => {
    const file = facts('tools/record.js');
    assert.deepEqual(file.writtenBy, []);
    assert.deepEqual(file.readBy, []);
    const lines = explained('tools/record.js');
    assert.ok(!lines.some((line) => line.startsWith('Written by ') || line.startsWith('Read by ')), lines.join('\n'));
  });
});

describe('atlas explain for a part', () => {
  it('answers for a part named by its name', () => {
    const lines = explained('engine');
    assert.deepEqual(lines.slice(0, -1), [
      'engine is a part of 1 file (code), drawn from `lib/**`.',
      'On the path of Ledger through engine.',
      'It imports no other part.',
      'It is imported by 1 part: tools.',
      'Writes to store/ledger/; read by site/index.html (found by text), test/ledger.test.js (from tests) and tools/summary.js.',
      'No order of work is recorded; only files a door runs, and the files they call, carry one.',
    ]);
    assert.match(lines.at(-1), MAP_LINE);
  });

  it('gives the part in JSON, with the same keys a file or directory has and its own', () => {
    const part = facts('engine');
    assert.equal(part.kind, 'part');
    assert.equal(part.path, null);
    assert.equal(part.part, 'engine');
    assert.equal(part.role, 'code');
    assert.equal(part.files, 1);
    assert.deepEqual(part.globs, ['lib/**']);
    assert.deepEqual(part.doors, { builtBy: [], checkedBy: [], isDoor: null, onPath: ['Ledger'], runBy: [] });
    assert.deepEqual(part.importedBy, ['tools']);
    assert.deepEqual(part.writes, [{ place: 'store/ledger/', readers: ['site/index.html', 'test/ledger.test.js', 'tools/summary.js'] }]);
    assert.deepEqual(part.writtenBy, []);
    assert.deepEqual(part.readBy, []);
    assert.match(part.mapCommit, /^[0-9a-f]{40}$/);
  });

  it('answers for a part whose files are a place, with who writes it', () => {
    const part = facts('store');
    // A path is tried before a part name: store is the directory and the part.
    assert.equal(part.kind, 'directory');
    const byName = explained('tools');
    assert.equal(byName[0], 'tools/ is a directory; its 2 files are in tools (code), the part explained here.');
    const lines = explained('tests');
    assert.equal(lines[0], 'tests is a part of 1 file (test), drawn from `test/**`.');
  });

  it('still fails on a name that is neither a path nor a part', () => {
    const result = explain('ledger');
    assert.equal(result.status, 2);
    assert.equal(result.lines[0], 'ATLAS_EXPLAIN_UNKNOWN_PATH  The path is not in the committed map.');
    assert.equal(result.lines[1], '  what changed:   ledger names no file, directory or part in atlas/structure.json');
  });
});
