import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { BUILD_OUTPUT, makeRepo } from './fixture-repo.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

const BOUNDARIES = [
  { name: 'app', globs: ['app/**'] },
  { name: 'one', globs: ['one/**'] },
  { name: 'bundle', globs: ['bundle/**'] },
  { name: 'left', globs: ['span/left/**'] },
  { name: 'right', globs: ['span/right/**'] },
  { name: 'plain', globs: ['plain/**'] },
];

describe('build output', () => {
  it('maps one source to a file, one boundary to a chunk, and a span to unresolved', () => {
    const root = makeRepo(BUILD_OUTPUT);
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
    const use = result.boundaries.find((boundary) => boundary.name === 'app').files.find((file) => file.path === 'app/use.js');
    const bySpec = Object.fromEntries(use.imports.map((site) => [site.specifier, site.resolved]));
    assert.deepEqual(bySpec['@ws/one'], { outcome: 'file', path: 'one/src/index.ts' });
    assert.deepEqual(bySpec['@ws/bundle'], { outcome: 'boundary', boundary: 'bundle' });
    assert.deepEqual(bySpec['@ws/span'], { outcome: 'unresolved', reason: 'chunk-spans-boundaries' });
    assert.deepEqual(bySpec['@ws/plain'], { outcome: 'file', path: 'plain/src/plain.ts' });
    const resolvedPaths = use.imports.map((site) => site.resolved.path).filter(Boolean);
    assert.ok(resolvedPaths.every((path) => !path.split('/').includes('dist')));
  });

  it('resolves declared build output from tracked source when dist has not been emitted', () => {
    const root = makeRepo(BUILD_OUTPUT);
    roots.push(root);
    const removed = spawnSync('git', ['rm', '-r', '--ignore-unmatch', 'one/dist', 'plain/dist', 'bundle/dist', 'span/dist'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(removed.status, 0, removed.stderr);
    const result = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
    const use = result.boundaries.find((boundary) => boundary.name === 'app').files.find((file) => file.path === 'app/use.js');
    const bySpec = Object.fromEntries(use.imports.map((site) => [site.specifier, site.resolved]));
    assert.deepEqual(bySpec['@ws/one'], { outcome: 'file', path: 'one/src/index.ts' });
    assert.deepEqual(bySpec['@ws/plain'], { outcome: 'file', path: 'plain/src/plain.ts' });
    assert.deepEqual(bySpec['@ws/bundle'], { outcome: 'unresolved', reason: 'build-output-without-source' });
    assert.deepEqual(bySpec['@ws/span'], { outcome: 'unresolved', reason: 'build-output-without-source' });
  });
});
