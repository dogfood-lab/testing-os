import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/site-links: href links in a site configuration (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/site-links');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an href in a site configuration', () => {
  it('is a link, never a read of the tracked place it names', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'site', globs: ['site/**'], role: 'site' }, { name: 'pages', globs: ['viewer/**', 'release/**'], role: 'site' }] });
    assert.deepEqual(mapped.landings.filter((landing) => landing.readers.some((entry) => entry.by === 'site/src/site-config.ts')), []);
  });
});
