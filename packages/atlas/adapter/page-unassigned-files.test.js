import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unassigned-files: a tracked file in no part (see README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unassigned-files');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a file in no part', () => {
  it('is said among what the map cannot see', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'root', globs: ['*'], role: 'docs' }, { name: 'src', globs: ['src/**'], role: 'code' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { limits } = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unassigned-files' }).json);
    assert.ok(limits.includes('1 file belongs to no part: examples/ci/release-binaries.yml.'), limits.join('\n'));
  });
});
