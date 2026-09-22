import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { LANGUAGES, makeRepo } from './fixture-repo.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

const CODE = { name: 'code', globs: ['**'], role: 'code', status: 'accepted' };

const external = { outcome: 'external' };
const dynamic = { outcome: 'unresolved', reason: 'dynamic' };
const wildcard = { outcome: 'unresolved', reason: 'wildcard' };
const missing = { outcome: 'unresolved', reason: 'python-module-not-found' };
const file = (path) => ({ outcome: 'file', path });

function entry(specifier, kind, line, resolved) {
  return { specifier, kind, line, resolved };
}

const EXPECTED = {
  'js/static.js': [
    entry('pkg-a', 'static', 1, external),
    entry('pkg-b', 'static', 2, external),
    entry('star', 'static', 3, external),
    entry('side-effect', 'static', 4, external),
    entry('dyn-lit', 'static', 5, external),
    entry('cjs-lit', 'static', 6, external),
    entry('./dynamic.js', 'static', 7, file('js/dynamic.js')),
  ],
  'js/dynamic.js': [entry('expr', 'dynamic', 1, dynamic), entry('name', 'dynamic', 2, dynamic)],
  'js/view.jsx': [entry('react', 'static', 1, external)],
  'js/legacy.cjs': [entry('legacy-cjs', 'static', 1, external)],
  'js/extra.mjs': [entry('esm-only', 'static', 1, external), entry('./dynamic.js', 'static', 2, file('js/dynamic.js'))],
  'ts/static.ts': [
    entry('types', 'static', 1, external),
    entry('reexport-type', 'static', 2, external),
    entry('mod', 'static', 3, external),
  ],
  'ts/dynamic.ts': [entry('name', 'dynamic', 1, dynamic)],
  'tsx/view.tsx': [entry('react', 'static', 1, external)],
  'tsx/load.tsx': [entry('name', 'dynamic', 1, dynamic)],
  'py/static.py': [
    entry('a.b', 'static', 1, external),
    entry('a.b', 'static', 2, external),
    entry('a', 'static', 3, external),
    entry('b', 'static', 3, external),
    entry('a.b', 'static', 4, external),
    entry('.x', 'static', 5, missing),
    entry('..x', 'static', 6, missing),
    entry('.', 'static', 7, missing),
    entry('..', 'static', 8, missing),
  ],
  'py/wild.py': [
    entry('x', 'wildcard', 1, wildcard),
    entry('.y', 'wildcard', 2, wildcard),
    entry('name', 'dynamic', 3, dynamic),
    entry('a.b', 'dynamic', 4, dynamic),
    entry('z', 'dynamic', 5, dynamic),
  ],
};

const LANGUAGE = {
  'js/static.js': 'javascript',
  'js/dynamic.js': 'javascript',
  'js/view.jsx': 'javascript',
  'js/legacy.cjs': 'javascript',
  'js/extra.mjs': 'javascript',
  'js/broken.js': 'javascript',
  'ts/static.ts': 'typescript',
  'ts/dynamic.ts': 'typescript',
  'ts/broken.ts': 'typescript',
  'tsx/view.tsx': 'tsx',
  'tsx/load.tsx': 'tsx',
  'tsx/broken.tsx': 'tsx',
  'py/static.py': 'python',
  'py/wild.py': 'python',
  'py/broken.py': 'python',
};

describe('import extraction', () => {
  it('records specifiers, kinds and lines, and counts dynamic, wildcard and parse failures', () => {
    const root = makeRepo(LANGUAGES);
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: [CODE] });
    assert.equal(result.boundaries.length, 1);
    const boundary = result.boundaries[0];
    assert.deepEqual(result.unassigned.map((file) => file.path), []);
    assert.deepEqual(result.overlaps, []);
    const byPath = new Map(boundary.files.map((file) => [file.path, file]));

    for (const [path, imports] of Object.entries(EXPECTED)) {
      const file = byPath.get(path);
      assert.ok(file, path);
      assert.equal(file.language, LANGUAGE[path], path);
      assert.equal(file.parseError, undefined, path);
      assert.deepEqual(file.imports, imports, path);
    }

    for (const path of ['js/broken.js', 'ts/broken.ts', 'tsx/broken.tsx', 'py/broken.py']) {
      const file = byPath.get(path);
      assert.equal(file.language, LANGUAGE[path], path);
      assert.equal(file.parseError, true, path);
      assert.deepEqual(file.imports, [], path);
    }

    for (const path of ['notes.md', 'data.json']) {
      const file = byPath.get(path);
      assert.equal(file.language, null, path);
      assert.equal(file.imports, 'unavailable', path);
      assert.equal(file.parseError, undefined, path);
    }

    assert.equal(boundary.parseErrors, 4);
    assert.equal(boundary.unresolvedSites, 13);
    assert.equal(boundary.importConfidence, 'full');
    assert.equal(boundary.files.length, Object.keys(EXPECTED).length + 4 + 2);
  });
});
