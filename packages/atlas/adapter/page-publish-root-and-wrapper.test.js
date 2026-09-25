import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/publish-root-and-wrapper: the repository's own package on
// a tag, and a wrapper a dispatch input names (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/publish-root-and-wrapper');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('two publishes to one registry', () => {
  it('names the repository\'s own package beside the one chosen at run time', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'examples', globs: ['examples/**'], role: 'code' }, { name: 'src', globs: ['src/**'], role: 'code' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/publish-root-and-wrapper' });
    assert.ok(markdown.includes('It publishes @l/tool (examples/tool) and @l/launcher to npm.'), markdown.split('\n').find((line) => line.includes('It publishes')));
  });
});
