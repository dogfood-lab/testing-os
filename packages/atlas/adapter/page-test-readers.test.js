import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage, readersClause } from './page.js';

// fixtures/atlas/test-readers: a script a workflow commits the output of
// writes two fixture files, and a test reads one of them by its path.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/test-readers');
const BOUNDARIES = [
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  { name: 'fixtures', globs: ['fixtures/**'], role: 'config' },
  { name: 'test', globs: ['test/**'], role: 'test' },
  { name: 'root', globs: ['*'], role: 'config' },
];
const roots = [];
let structure;
let markdown;
let page;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  structure = buildArtifact(mapRepository({ repoPath: root, boundaries: BOUNDARIES }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/test-readers' });
  markdown = built.markdown;
  page = JSON.parse(built.json);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a test that reads a place', () => {
  it('is a reader of it, marked from tests', () => {
    const golden = structure.landings.find((landing) => landing.target === 'fixtures/golden.json');
    assert.deepEqual(golden.readers.filter((entry) => entry.by !== '.github/workflows/goldens.yml'), [{ by: 'test/golden.test.js', call: 'readFileSync', confidence: 'ast', fromTests: true }]);
    // The door's two landings share fixtures/, which Who reads the results names.
    assert.ok(markdown.includes('- **fixtures/** is read by test/golden.test.js (from tests).'), markdown);
  });

  it('counts the tests that read a place after the code that does', () => {
    assert.equal(readersClause(['scripts/report.mjs'], 3), 'scripts/report.mjs, and by 3 tests');
    assert.equal(readersClause([], 2), '2 tests');
    assert.equal(readersClause(['a.js', 'b.js'], 0), 'a.js and b.js');
  });

  it('keeps the place out of written but never read, which names only what no reader of either kind reads', () => {
    assert.deepEqual(page.unread.map((item) => item.place), ['fixtures/other.json']);
  });
});
