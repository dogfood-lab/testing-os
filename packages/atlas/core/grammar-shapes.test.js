import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/grammar-shapes: the three constructs the vendored grammar
// rejects though TypeScript accepts them (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/grammar-shapes');
const roots = [];
let files;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'src', globs: ['src/**'], role: 'code' }] });
  files = new Map(mapped.boundaries[0].files.map((file) => [file.path, file]));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function imported(path) {
  return files.get(path).imports.map((site) => `${site.specifier} ${site.kind} ${site.line}`).sort();
}

describe('a construct the grammar rejects that TypeScript accepts', () => {
  it('reads typeof import(...) as a type argument, and keeps its specifier as the import it is', () => {
    assert.equal(files.get('src/mint.test.ts').parseError, undefined);
    assert.deepEqual(imported('src/mint.test.ts'), ['./mint.js dynamic-literal 5', './mint.js static 2', 'vitest static 1']);
  });

  it('reads import(...).T[] with the lines of everything after it unmoved', () => {
    assert.equal(files.get('src/walk.ts').parseError, undefined);
    assert.deepEqual(imported('src/walk.ts'), ['./mint.js static 2', 'node:fs dynamic-literal 5', 'node:fs static 1']);
  });

  it('reads a bare & in JSX text, on a tag\'s line and on its own', () => {
    assert.equal(files.get('src/panel.tsx').parseError, undefined);
    assert.deepEqual(imported('src/panel.tsx'), ['./walk.js static 1']);
  });

  it('leaves any other syntax unread, as before', () => {
    assert.equal(files.get('src/broken.ts').parseError, true);
  });
});
