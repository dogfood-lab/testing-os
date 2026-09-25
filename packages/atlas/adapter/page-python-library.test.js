import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/python-library: a published Python library that installs
// no command (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/python-library');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a Python library with no command', () => {
  it('is the package people import', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'record_index', globs: ['record_index/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/python-library' });
    assert.match(JSON.parse(json).derived, /It publishes to PyPI\. People import record_index\.$/);
  });
});
