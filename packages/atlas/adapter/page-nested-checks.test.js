import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/nested-checks: a check of a directory and of the one
// holding it (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/nested-checks');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a directory checked beside the one holding it', () => {
  it('is said by the one holding it alone', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }] }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/nested-checks' });
    assert.ok(markdown.includes('2. **Release.** When a release is published. Checks src/.'), markdown);
    assert.ok(!markdown.includes('src/tool/ and src/'), markdown);
  });
});
