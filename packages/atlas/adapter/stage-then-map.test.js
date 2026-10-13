import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { formatFailure } from './errors.js';

// docs/atlas-buildup.spec.md, slice AM, item AM-3. On 2026-10-13 interlock's
// main went red because a receipt was written, the map made, and only then
// the receipt staged: the map never saw it, and check in CI failed on it.
// This replays that order and the right one.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function scratch() {
  const path = mkdtempSync(join(tmpdir(), 'atlas-stage-'));
  roots.push(path);
  return path;
}

function write(repo, path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

// interlock's shape before the fix: receipts/ in no part, one receipt
// already listed as unassigned by the committed map.
function interlock() {
  const repo = scratch();
  git(repo, ['init', '--quiet']);
  write(repo, 'src/route.py', 'def route():\n    return 1\n');
  write(repo, 'receipts/e5-2026-10-12.jsonl', '{"run": 1}\n');
  write(repo, 'atlas/boundaries.yaml', 'boundaries:\n  - name: src\n    globs:\n      - src/**\n    role: code\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'repo']);
  assert.equal(atlas(repo, ['map']).status, 0);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'map']);
  return repo;
}

function cleanClone(repo) {
  const dest = scratch();
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', 'clone', '--quiet', repo, dest], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return dest;
}

describe('a new file mapped before it is staged', () => {
  it('is named by map, then fails check in a clean clone once committed', () => {
    const repo = interlock();
    write(repo, 'receipts/e5-2026-10-13.jsonl', '{"run": 2}\n');
    const early = atlas(repo, ['map']);
    assert.equal(early.status, 0, early.stdout + early.stderr);
    assert.match(early.stderr, /ATLAS_MAP_UNTRACKED[^\n]*\n {2}what changed: {3}1 untracked file outside \.gitignore: receipts\/e5-2026-10-13\.jsonl/);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'receipt and map']);
    const ci = atlas(cleanClone(repo), ['check']);
    assert.equal(ci.status, 1, ci.stdout);
    assert.match(ci.stdout, /ATLAS_UNASSIGNED_NEW[^\n]*\n {2}what changed: {3}receipts\/e5-2026-10-13\.jsonl\n {2}what to do: {5}add the lines below to atlas\/boundaries\.yaml, stage the new files, run atlas map and commit atlas\/; or revert the change/);
  });

  it('passes check in a clean clone when it is staged before the map', () => {
    const repo = interlock();
    write(repo, 'receipts/e5-2026-10-13.jsonl', '{"run": 2}\n');
    git(repo, ['add', '-A']);
    const staged = atlas(repo, ['map']);
    assert.equal(staged.status, 0, staged.stdout + staged.stderr);
    assert.doesNotMatch(staged.stderr, /ATLAS_MAP_UNTRACKED/);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '--quiet', '-m', 'receipt and map']);
    const ci = atlas(cleanClone(repo), ['check']);
    assert.equal(ci.status, 0, ci.stdout);
  });
});

describe('the hint of a drift finding', () => {
  it('says to stage new files before mapping', () => {
    assert.match(formatFailure('ATLAS_STRUCTURE_DRIFT', ['new edge a → b (import)']), /what to do: {5}stage any new files, run atlas map and commit atlas\/; or revert the change\n/);
  });
});
