import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/file-writes: scripts that write a file beside themselves
// through new URL(…, import.meta.url), tracked or not, one that makes a
// directory, a shell script that redirects into a file, and a workflow that
// commits a baseline file it generates under .github/.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/file-writes');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function writers(target) {
  return (structure.landings.find((landing) => landing.target === target)?.writers ?? []).map((entry) => entry.by);
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-file-writes-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'file-writes']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a file write lands on the file, not its directory', () => {
  it('resolves new URL(…, import.meta.url) beside the script, whether or not the file is tracked', () => {
    assert.deepEqual(writers('scripts/live-replay-receipt.json'), ['scripts/live-replay.mjs']);
    assert.deepEqual(writers('scripts/pirate-receipt.json'), ['scripts/pirate-replay.mjs']);
    assert.deepEqual(writers('scripts/notes/summary.txt'), ['scripts/summary.mjs']);
  });

  it('lands a shell redirect on the file it names', () => {
    assert.deepEqual(writers('scripts/notes/dump.txt'), ['scripts/dump.sh']);
  });

  it('keeps a directory a script makes as the directory it is made in, and names no directory for the files', () => {
    assert.deepEqual(writers('scripts'), ['scripts/cache.mjs']);
    assert.deepEqual(writers('scripts/notes'), []);
  });

  it('commits the file a workflow stages without claiming its directory as generated', () => {
    const door = structure.doors.find((item) => item.file === '.github/workflows/mutmut.yml');
    assert.deepEqual(door.landings, ['.github/mutmut-baseline.txt']);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === '.github').origin, 'mixed');
    const generated = section('## Generated, never hand-edited');
    assert.ok(generated.includes('- **.github/mutmut-baseline.txt** is written by .github/workflows/mutmut.yml.'), generated.join('\n'));
    assert.ok(!generated.some((line) => line.startsWith('- **.github/**')), generated.join('\n'));
  });
});
