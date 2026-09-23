import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { parse } from 'yaml';

// fixtures/atlas/init-fixture-manifest: a package whose test/ holds a sample
// repository with a package.json of its own, and whose spec/ holds a fixture
// with a pyproject.toml. Neither is a package of this repository.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/init-fixture-manifest');
const roots = [];

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a manifest inside test material', () => {
  it('proposes no part, and leaves the test directory that holds it one part', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-init-fixture-'));
    roots.push(root);
    cpSync(FIXTURE, root, { recursive: true });
    git(root, ['init']);
    git(root, ['config', 'core.autocrlf', 'false']);
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'init-fixture-manifest']);
    const init = spawnSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stdout + init.stderr);
    const boundaries = parse(readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries;
    assert.deepEqual(boundaries.map((boundary) => [boundary.name, boundary.globs]), [
      ['root', ['*']],
      ['spec', ['spec/**']],
      ['src', ['src/**']],
      ['test', ['test/**']],
    ]);
    assert.match(init.stdout, /unassigned {2}0 files/);
  });
});
