import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/nested-namesake: an installed dependency named like a
// nested subpackage (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/nested-namesake');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a dependency named like a nested subpackage', () => {
  it('is the dependency, and shares its name with nothing local', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'tool', globs: ['src/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'config' }] }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/nested-namesake' });
    assert.ok(!markdown.includes('shares its name'), markdown);
  });
});
