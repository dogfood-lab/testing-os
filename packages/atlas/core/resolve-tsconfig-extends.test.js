import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = join(REPO, 'fixtures/atlas/tsconfig-extends');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a tsconfig whose extends target is not tracked', () => {
  it('still resolves relative imports under it', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    const file = result.boundaries[0].files.find((entry) => entry.path === 'src/a.js');
    assert.ok(file, 'src/a.js is mapped');
    const site = file.imports.find((entry) => entry.specifier === './b.js');
    assert.deepEqual(site.resolved, { outcome: 'file', path: 'src/b.js' });
  });
});
