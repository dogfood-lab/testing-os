import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/many-sites: two sites in one repository (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/many-sites');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('more than one site', () => {
  it('names each site by its part', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'film', globs: ['apps/film/**'], role: 'site' }, { name: 'rpg', globs: ['apps/rpg/**'], role: 'site' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/many-sites' });
    assert.deepEqual(JSON.parse(json).partLabels, { film: 'film', rpg: 'rpg' });
    assert.ok(markdown.includes('in film') && markdown.includes('in rpg'), markdown);
    assert.ok(!markdown.includes('the site'), markdown);
  });
});
