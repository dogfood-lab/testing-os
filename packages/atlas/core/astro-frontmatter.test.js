import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/astro-frontmatter: Astro pages and a component whose
// frontmatter imports code and data (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/astro-frontmatter');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an Astro file\'s frontmatter', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'site', globs: ['site/**'], role: 'site' }, { name: 'lib', globs: ['lib/**'], role: 'code' }] });
  const file = (path) => mapped.boundaries.flatMap((boundary) => boundary.files).find((entry) => entry.path === path);

  it('is read for its imports, a component and a dynamic import of data among them', () => {
    const resolved = file('site/src/pages/dashboard.astro').imports.map((site) => site.resolved?.path ?? null);
    assert.deepEqual(resolved, ['site/src/components/AppShell.astro', 'site/src/data/stats.json']);
    assert.deepEqual(file('site/src/components/AppShell.astro').imports.map((site) => site.resolved?.path ?? null), ['lib/format.ts']);
  });

  it('makes the site a part that imports lib', () => {
    assert.ok(mapped.edges.some((edge) => edge.from === 'site' && edge.to === 'lib'), JSON.stringify(mapped.edges));
  });
});
