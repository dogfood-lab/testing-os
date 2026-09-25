import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/dependency-names: dependencies imported under names their
// distributions do not fold to (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/dependency-names');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a dependency imported under another name', () => {
  it('is the dependency, not the local module of that name off the import path', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'app', globs: ['app/**'], role: 'code' }] });
    const ledger = mapped.boundaries[0].files.find((file) => file.path === 'app/ledger.py');
    assert.deepEqual(ledger.imports.map((site) => [site.specifier, site.resolved.outcome, site.resolved.declared === true]), [['docx', 'external', true], ['xrpl', 'external', true]]);
    assert.equal(mapped.boundaries[0].unresolvedSites, 0);
  });
});
