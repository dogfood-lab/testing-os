import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/data-package: a package whose every export is JSON, beside
// a CI that runs code (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/data-package');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a data-only package', () => {
  it('is the data package people import, which ships its files, and ranks after code', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'data', globs: ['data/**'], role: 'data' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }, { name: 'scripts', globs: ['scripts/**'], role: 'code' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/data-package' });
    assert.equal(JSON.parse(json).mainDoor, '.github/workflows/ci.yml');
    assert.ok(markdown.includes('**@d/registry** (the data package people import). Ships data/registry.json, data/extra.json and data/tools.json.'), markdown);
  });
});
