import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { BUILD_OUTPUT, LANGUAGES, makeRepo } from './fixture-repo.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('inter-boundary edges', () => {
  it('keeps one file edge per pair from the languages fixture, sorted', () => {
    const root = makeRepo(LANGUAGES);
    roots.push(root);
    const result = mapRepository({
      repoPath: root,
      boundaries: [
        { name: 'scripts', globs: ['js/static.js', 'js/extra.mjs'] },
        { name: 'runtime', globs: ['js/dynamic.js'] },
        { name: 'rest', globs: ['ts/**', 'tsx/**', 'py/**', 'js/view.jsx', 'js/legacy.cjs', 'js/broken.js', '*.md', '*.json'] },
      ],
    });
    assert.deepEqual(result.edges, [{ from: 'scripts', to: 'runtime', kind: 'file' }]);
    const texts = result.edges.map((edge) => `${edge.from}\0${edge.to}\0${edge.kind}`);
    assert.deepEqual(texts, [...new Set(texts)]);
    const sorted = [...result.edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
    assert.deepEqual(result.edges, sorted);
  });

  it('records a chunk edge from the bundled package and no edge to a generated file', () => {
    const root = makeRepo(BUILD_OUTPUT);
    roots.push(root);
    const result = mapRepository({
      repoPath: root,
      boundaries: [
        { name: 'app', globs: ['app/**'] },
        { name: 'one', globs: ['one/**'] },
        { name: 'bundle', globs: ['bundle/**'] },
        { name: 'left', globs: ['span/left/**'] },
        { name: 'right', globs: ['span/right/**'] },
        { name: 'plain', globs: ['plain/**'] },
      ],
    });
    assert.deepEqual(result.edges, [
      { from: 'app', to: 'bundle', kind: 'chunk' },
      { from: 'app', to: 'one', kind: 'file' },
      { from: 'app', to: 'plain', kind: 'file' },
    ]);
  });
});
