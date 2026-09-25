import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/temp-roots: saveSong(song, dir) is handed a directory made
// under mkdtempSync(join(tmpdir(), ...)), directly and through a class field,
// and one a function of another file returns from JAM_HOME or the home
// directory; Python writes under tempfile.gettempdir() and mkdtemp(). None of
// them is the tracked songs/ beside them.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/temp-roots');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function door(file) {
  return structure.doors.find((item) => item.file === `.github/workflows/${file}`);
}

function writer(target) {
  return structure.landings.find((landing) => landing.target === target)?.writers ?? [];
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-temp-roots-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'temp-roots']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a root made in a temporary directory, or returned from the home directory', () => {
  it('lands nothing in the repository', () => {
    assert.deepEqual(door('ci.yml').landings, []);
    assert.deepEqual(writer('songs'), []);
    assert.equal(structure.landings.some((landing) => landing.target.startsWith('songs/') && landing.writers.length > 0), false);
  });

  // saveSong's two writes, each counted once whoever calls it, and cache.py's
  // write_text; Path.mkdir() is no write this map reads.
  it('counts every such write as outside, a temporary directory among the places it can go', () => {
    const outside = structure.boundaries.reduce((sum, boundary) => sum + (boundary.outsideWrites ?? 0), 0);
    assert.equal(outside, 3);
    const limits = section('## What this map cannot see');
    assert.ok(limits.includes('- 2 writes go to the home directory (.jam), a temporary directory or a path their caller passes, not to this repository.'), limits.join('\n'));
    assert.ok(limits.includes('- 1 write goes to a temporary directory, not to this repository.'), limits.join('\n'));
  });

  it('keeps songs/ written by people', () => {
    assert.equal(markdown.includes('**songs/** is written by'), false);
  });
});
