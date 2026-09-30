import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { ERRORS } from './errors.js';

/**
 * A command run outside any git repository fails in the one error shape,
 * with a code from the table (docs/atlas-production.spec.md, Part 1 item 4):
 * the code and its sentence, what changed, what to do, and exit 2. It used to
 * be a bare usage line that no reader could look up.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const scratch = [];

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

// A directory git cannot place in any repository: the ceiling stops git from
// finding one above it, wherever the temporary directory is.
function looseDirectory() {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-loose-'));
  scratch.push(dir);
  writeFileSync(join(dir, 'notes.txt'), 'not a repository\n');
  return dir;
}

function run(cwd, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(cwd) },
  });
  return { status: result.status, stdout: result.stdout, lines: result.stdout.trimEnd().split('\n') };
}

describe('a command outside any git repository', () => {
  it('has a code in the error table', () => {
    assert.equal(ERRORS.ATLAS_NOT_A_REPOSITORY, 'The directory is not in a git repository.');
  });

  for (const args of [['init'], ['map'], ['check'], ['explain', 'notes.txt'], ['gaps'], ['diff', '--base', 'main']]) {
    it(`atlas ${args.join(' ')} fails in the error shape, exit 2`, () => {
      const dir = looseDirectory();
      const result = run(dir, args);
      assert.equal(result.status, 2, result.stdout);
      assert.equal(result.lines[0], 'ATLAS_NOT_A_REPOSITORY  The directory is not in a git repository.');
      assert.match(result.lines[1], /^ {2}what changed: {3}.+ is in no git repository$/);
      assert.match(result.lines[2], new RegExp(`^ {2}what to do: {5}run atlas ${args[0]} inside a git repository`));
      assert.equal(result.lines.at(-1), 'exit 2');
      assert.ok(!result.stdout.includes('atlas: not a git repository'), 'no bare usage line');
    });
  }
});
