import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { ALPHA, BETA, makeFixtureRepo } from './fixture-repo.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

function membership(result) {
  return [
    ...result.boundaries.flatMap((boundary) => boundary.files.map((file) => file.path)),
    ...result.unassigned.map((file) => file.path),
    ...result.overlaps.map((file) => file.path),
  ];
}

describe('index modes', () => {
  it('records a symlink and does not hash it', () => {
    const root = makeFixtureRepo();
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: [ALPHA, BETA] });
    assert.deepEqual(result.symlinks, [{ path: 'linked.md', target: 'README.md' }]);
    assert.deepEqual(result.submodules, []);
    assert.ok(!membership(result).includes('linked.md'));
    assert.match(git(root, ['ls-files', '--stage', '--', 'linked.md']), /^120000 /);
    assert.equal(result.generatedFrom.tracked, membership(result).length);
  });

  it('hashes an executable and records a gitlink without a nested repository', () => {
    const root = makeFixtureRepo();
    roots.push(root);
    writeFileSync(join(root, 'scripts', 'run.js'), 'export const run = 1;\n');
    git(root, ['add', '--', 'scripts/run.js']);
    git(root, ['update-index', '--chmod=+x', '--', 'scripts/run.js']);
    const sha = git(root, ['rev-parse', 'HEAD']).trim();
    git(root, ['update-index', '--add', '--cacheinfo', `160000,${sha},vendor/dep`]);
    const result = mapRepository({ repoPath: root, boundaries: [ALPHA, BETA] });
    const run = result.unassigned.find((file) => file.path === 'scripts/run.js');
    assert.ok(run);
    assert.equal(run.language, 'javascript');
    assert.deepEqual(run.imports, []);
    assert.match(run.hash, /^[0-9a-f]{64}$/);
    assert.deepEqual(result.submodules, ['vendor/dep']);
    assert.ok(!membership(result).includes('vendor/dep'));
    assert.match(git(root, ['ls-files', '--stage', '--', 'scripts/run.js']), /^100755 /);
    assert.match(git(root, ['ls-files', '--stage', '--', 'vendor/dep']), /^160000 /);
  });
});
