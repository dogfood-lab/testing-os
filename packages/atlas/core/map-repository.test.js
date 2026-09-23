import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { ALPHA, BETA, FIXTURE, RESOLVE_JS, SHARED, makeFixtureRepo, makeRepo } from './fixture-repo.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function repo() {
  const root = makeFixtureRepo();
  roots.push(root);
  return root;
}

describe('mapRepository', () => {
  it('assigns files matched by exactly one boundary', () => {
    const result = mapRepository({ repoPath: repo(), boundaries: [BETA, ALPHA] });
    const alpha = result.boundaries.find((b) => b.name === 'alpha');
    const beta = result.boundaries.find((b) => b.name === 'beta');
    assert.deepEqual(alpha.files.map((f) => f.path), [
      'packages/alpha/index.js',
      'packages/alpha/lib/one.js',
    ]);
    assert.deepEqual(beta.files.map((f) => f.path), [
      'packages/beta/beta.test.js',
      'packages/beta/index.js',
    ]);
    assert.deepEqual(result.boundaries.map((b) => b.name), ['alpha', 'beta']);
  });

  it('reports files matched by none as unassigned', () => {
    const result = mapRepository({ repoPath: repo(), boundaries: [ALPHA, BETA] });
    assert.deepEqual(result.unassigned.map((f) => f.path), [
      'README.md',
      'scripts/legacy.mjs',
      'shared/util.js',
    ]);
  });

  it('reports a file matched by two boundaries as an overlap and in neither file list', () => {
    const result = mapRepository({ repoPath: repo(), boundaries: [SHARED, BETA, ALPHA] });
    const hit = result.overlaps.find((row) => row.path === 'packages/alpha/lib/one.js');
    assert.ok(hit);
    assert.deepEqual(hit.boundaries, ['alpha', 'shared']);
    const alpha = result.boundaries.find((b) => b.name === 'alpha');
    const shared = result.boundaries.find((b) => b.name === 'shared');
    assert.ok(!alpha.files.some((f) => f.path === 'packages/alpha/lib/one.js'));
    assert.ok(!shared.files.some((f) => f.path === 'packages/alpha/lib/one.js'));
    assert.deepEqual(shared.files.map((f) => f.path), ['shared/util.js']);
  });

  it('hashes every file and matches an independent SHA-256 of README.md', () => {
    const result = mapRepository({ repoPath: repo(), boundaries: [ALPHA, BETA] });
    const entries = [
      ...result.boundaries.flatMap((b) => b.files),
      ...result.unassigned,
      ...result.overlaps,
    ];
    for (const entry of entries) {
      assert.match(entry.hash, /^[0-9a-f]{64}$/);
    }
    const expected = createHash('sha256').update(readFileSync(join(FIXTURE, 'README.md'))).digest('hex');
    assert.equal(result.unassigned.find((f) => f.path === 'README.md').hash, expected);
  });

  it('returns the same result across calls and input order', () => {
    const root = repo();
    const first = mapRepository({ repoPath: root, boundaries: [ALPHA, BETA] });
    const second = mapRepository({ repoPath: root, boundaries: [ALPHA, BETA] });
    const reversed = mapRepository({ repoPath: root, boundaries: [BETA, ALPHA] });
    assert.deepEqual(second, first);
    assert.deepEqual(reversed, first);
  });

  it('ignores a file that is not tracked', () => {
    const root = repo();
    writeFileSync(join(root, 'scratch.txt'), 'not tracked\n');
    const result = mapRepository({ repoPath: root, boundaries: [ALPHA, BETA] });
    const paths = [
      ...result.boundaries.flatMap((b) => b.files.map((f) => f.path)),
      ...result.unassigned.map((f) => f.path),
      ...result.overlaps.map((f) => f.path),
    ];
    assert.ok(!paths.includes('scratch.txt'));
  });

  it('resolves a relative repository path before it resolves an import', () => {
    const root = makeRepo(RESOLVE_JS);
    roots.push(root);
    const parts = [{ name: 'app', globs: ['app/**'] }, { name: 'pkg', globs: ['pkg/**'] }];
    const absolute = mapRepository({ repoPath: root, boundaries: parts });
    // A child started in the fixture reads '.' from there; changing this
    // process's directory would move it under every test running beside it.
    const script = [
      `const { mapRepository } = await import(${JSON.stringify(new URL('./index.js', import.meta.url).href)});`,
      `process.stdout.write(JSON.stringify(mapRepository({ repoPath: '.', boundaries: ${JSON.stringify(parts)} })));`,
    ].join('\n');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(child.status, 0, child.stderr);
    const relative = JSON.parse(child.stdout);
    const outcomes = (result) => result.boundaries.flatMap((b) => b.files).flatMap((f) => (Array.isArray(f.imports) ? f.imports : []))
      .map((site) => site.resolved);
    assert.ok(outcomes(absolute).some((resolved) => resolved.outcome === 'file'), 'the fixture has a relative import to resolve');
    assert.deepEqual(outcomes(relative), outcomes(absolute));
    assert.deepEqual(relative.edges, absolute.edges);
  });

  it('throws on unusable input', () => {
    const root = repo();
    assert.throws(() => mapRepository({ boundaries: [ALPHA] }), /repoPath is required/);
    assert.throws(
      () => mapRepository({ repoPath: root, boundaries: [{ globs: ['**'] }] }),
      /boundary name is required/
    );
    assert.throws(
      () => mapRepository({ repoPath: root, boundaries: [ALPHA, { ...ALPHA }] }),
      /duplicate boundary name: alpha/
    );
  });
});
