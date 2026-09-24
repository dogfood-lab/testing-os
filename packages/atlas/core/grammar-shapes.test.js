import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/grammar-shapes: the constructs the vendored grammar
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

  it('reads typeof import(...) on a line of its own with a trailing comma', () => {
    assert.equal(files.get('src/trailing.test.ts').parseError, undefined);
    assert.deepEqual(imported('src/trailing.test.ts'), ['./walk.js dynamic-literal 5', 'vitest static 1']);
  });

  it('reads two comparisons in one object literal as comparisons, not type arguments', () => {
    assert.equal(files.get('src/steer.ts').parseError, undefined);
    assert.deepEqual(imported('src/steer.ts'), ['./mint.js static 1']);
  });

  it('reads abstract as a variable name, and as the modifier it also is', () => {
    assert.equal(files.get('src/card.ts').parseError, undefined);
    assert.deepEqual(imported('src/card.ts'), ['node:fs static 1']);
  });

  it('reads a decimal character reference past five digits in JSX text', () => {
    assert.equal(files.get('src/lock.tsx').parseError, undefined);
    assert.deepEqual(imported('src/lock.tsx'), ['./card.js static 1']);
  });

  it('reads a file holding a raw NUL byte, in a comment and in a string', () => {
    assert.equal(files.get('src/raw-byte.ts').parseError, undefined);
    assert.deepEqual(imported('src/raw-byte.ts'), ['./card.js static 1']);
  });

  it('leaves any other syntax unread, as before', () => {
    assert.equal(files.get('src/broken.ts').parseError, true);
  });
});
