import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/page-scripts: a page that loads a script a script here
// writes (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/page-scripts');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a page\'s script and stylesheet', () => {
  it('reads what its script tag and stylesheet link name', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const { landings } = mapRepository({ repoPath: root, boundaries: [{ name: 'assets', globs: ['assets/**'], role: 'site' }, { name: 'scripts', globs: ['scripts/**'], role: 'code' }] });
    const bundle = landings.find((landing) => landing.target === 'assets/print/print-bundle.js');
    assert.deepEqual(bundle.writers.map((entry) => entry.by), ['scripts/bundle.mjs']);
    assert.ok(bundle.readers.some((entry) => entry.by === 'assets/print/index.html' && entry.call === 'script'), JSON.stringify(bundle.readers));
    const css = landings.find((landing) => landing.target === 'assets/print/print.css');
    assert.ok(css.readers.some((entry) => entry.by === 'assets/print/index.html' && entry.call === 'stylesheet'), JSON.stringify(css));
  });
});
