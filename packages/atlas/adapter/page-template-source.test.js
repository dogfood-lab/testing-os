import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/template-source: a directory a script builds from the
// template it keeps there (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/template-source');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a template inside the directory its reader writes', () => {
  // The month pages' names spell SN_, which the template's does not: the
  // write lands on the pages of that shape, and the template is no part of
  // it. A template with the shape of the output is named as the file people
  // write (fixtures/atlas/written-into, site/).
  it('is left out of what the reader writes when the pages it writes have a shape the template has not', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }, { name: 'viewer', globs: ['viewer/**'], role: 'site' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/template-source' });
    assert.ok(markdown.includes('- **viewer/SN_*.html** is written by scripts/build_viewer.py.'), markdown);
    assert.ok(!markdown.includes('**viewer/** is written'), markdown);
    assert.equal(JSON.parse(json).generated.find((item) => item.place === 'viewer/'), undefined);
  });
});

describe('a file in a written directory that one of its writers never reads', () => {
  it('is named as no source, since that writer may write it', () => {
    const root = makeRepo(resolve(import.meta.dirname, '../../../fixtures/atlas/template-shared'));
    roots.push(root);
    const boundaries = [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }, { name: 'viewer', globs: ['viewer/**'], role: 'site' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/template-shared' });
    assert.ok(markdown.includes('- **viewer/** is written by scripts/build_viewer.py and scripts/index_pages.py.'), markdown);
  });
});
