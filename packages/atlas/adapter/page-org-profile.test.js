import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/org-profile: an organization's .github repository.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/org-profile');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an organization\'s .github repository', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [{ name: 'profile', globs: ['profile/**'], role: 'docs' }, { name: 'root', globs: ['*'], role: 'docs' }];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));

  it('is described as the profile page and the files its repositories inherit', () => {
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'acme/.github' });
    assert.match(JSON.parse(json).derived, /^This is the organization's profile page and the community-health files its repositories inherit\. 2 parts/);
  });

  it('is not, under any other name', () => {
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'acme/docs' });
    assert.match(JSON.parse(json).derived, /^2 parts/);
  });
});
