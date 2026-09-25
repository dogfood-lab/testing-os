import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/cache-dirs: a cache directory built from the platform's
// per-user variables (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cache-dirs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a per-user cache directory', () => {
  it('is the home directory, never a path the caller passes', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'bin', globs: ['bin/**'], role: 'code' }, { name: 'src', globs: ['src/**'], role: 'code' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { limits } = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/cache-dirs' }).json);
    assert.ok(limits.includes('1 write goes to the home directory (.cache/ and launcher/), not to this repository.'), limits.join('\n'));
    assert.ok(!limits.some((line) => line.includes('caller passes')), limits.join('\n'));
  });
});
