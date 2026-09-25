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
  it('is named as the file people write', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }, { name: 'viewer', globs: ['viewer/**'], role: 'site' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/template-source' });
    assert.ok(markdown.includes('- **viewer/** is written by scripts/build_viewer.py, except viewer/template.html, which it reads and people write.'), markdown);
    assert.deepEqual(JSON.parse(json).generated.find((item) => item.place === 'viewer/').sources, ['viewer/template.html']);
  });
});
