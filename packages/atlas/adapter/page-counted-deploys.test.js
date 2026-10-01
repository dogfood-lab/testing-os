import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/counted-deploys: two Dockerfiles and a compose file no
// workflow runs (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/counted-deploys');
const roots = [];
let data;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: '.github', globs: ['.github/**'], role: 'config' },
    { name: 'data', globs: ['data/**'], role: 'data' },
    { name: 'root', globs: ['*'], role: 'config' },
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
    { name: 'services', globs: ['services/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/counted-deploys' }).json);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a sentence whose subject is a count or a list', () => {
  it('takes the verb that agrees with all it names', () => {
    assert.ok(data.limits.includes('There are 2 Dockerfiles and a compose.yaml that no workflow runs; what deploys from them does so from outside this repository, and is not on this page.'), data.limits.join('\n'));
  });
});
