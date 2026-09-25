import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/first-line: Astro components, a stylesheet, a shell script,
// Markdown notes beside JSON records, and a Pages deploy (see the fixture's
// README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/first-line');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the first line', () => {
  it('counts the code it does not parse, names a large second kind of file, and says the site it deploys', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'components', globs: ['components/**'], role: 'code' },
      { name: 'styles', globs: ['styles/**'], role: 'code' },
      { name: 'cli', globs: ['cli/**'], role: 'code' },
      { name: 'data', globs: ['data/**'], role: 'data' },
      { name: 'site', globs: ['site/**'], role: 'site' },
      { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    ];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/first-line' });
    assert.equal(JSON.parse(json).derived, '6 parts, mostly JSON data (61 files) and Markdown (12); code in Astro (3), JavaScript (2), CSS (1) and shell (1). Work enters through 2 doors; the busiest is theme, which reaches 1 part. It deploys a site to GitHub Pages. People run theme.');
  });
});
