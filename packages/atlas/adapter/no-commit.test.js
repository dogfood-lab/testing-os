import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { ERRORS } from './errors.js';

/**
 * A repository with no commit has no HEAD, and every command that reads the
 * map at HEAD or stamps one with it fails in the error shape with a code from
 * the table, saying to commit once first (docs/atlas-production.spec.md,
 * Part 6). It used to be the bare line "atlas: git rev-parse HEAD failed".
 * init needs no commit: it is the first thing run in a new repository.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const HOST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/host');
const scratch = [];

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

// The host fixture, boundary file included, in a repository git has
// initialised and nothing has been committed to.
function unborn() {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-unborn-'));
  scratch.push(dir);
  cpSync(HOST, dir, { recursive: true });
  assert.equal(spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' }).status, 0);
  return dir;
}

function run(cwd, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, lines: result.stdout.trimEnd().split('\n') };
}

describe('a repository with no commit', () => {
  it('has a code in the error table', () => {
    assert.equal(ERRORS.ATLAS_NO_COMMIT, 'The repository has no commit yet.');
  });

  for (const args of [['map'], ['check'], ['explain', 'pkg/alpha/index.js'], ['gaps'], ['diff', '--base', 'main']]) {
    it(`atlas ${args.join(' ')} exits 2 with the code and says to commit once first`, () => {
      const dir = unborn();
      const result = run(dir, args);
      assert.equal(result.status, 2, result.stdout);
      assert.equal(result.lines[0], 'ATLAS_NO_COMMIT  The repository has no commit yet.');
      assert.equal(result.lines[1], '  what changed:   HEAD names no commit');
      assert.equal(result.lines[2], `  what to do:     commit once first (git add -A, then git commit), then run atlas ${args[0]}`);
      assert.equal(result.lines.at(-1), 'exit 2');
      assert.ok(!result.stdout.includes('rev-parse'), 'no bare git line');
      assert.ok(!existsSync(join(dir, 'atlas', 'structure.json')), 'nothing written');
    });
  }

  it('lets atlas init run, since init comes before the first commit', () => {
    const dir = unborn();
    rmSync(join(dir, 'atlas'), { recursive: true });
    const result = run(dir, ['init']);
    assert.equal(result.status, 0, result.stdout);
    assert.ok(existsSync(join(dir, 'atlas', 'boundaries.yaml')));
  });
});
