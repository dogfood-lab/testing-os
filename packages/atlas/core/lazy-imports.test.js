import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/lazy-imports: modules a package loads through a table of
// names (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/lazy-imports');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('import_module over a table of names', () => {
  it('imports every module the table holds', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'pkg', globs: ['pkg/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'config' }] });
    const init = mapped.boundaries[0].files.find((file) => file.path === 'pkg/__init__.py');
    assert.deepEqual(init.imports.filter((site) => site.table).map((site) => site.resolved?.path), ['pkg/health.py', 'pkg/intelligence.py']);
    assert.equal(init.imports.filter((site) => site.kind === 'dynamic').length, 0);
  });
});
