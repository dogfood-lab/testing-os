import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/gated-shell-writes: a redirect in a job run only by hand
// (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/gated-shell-writes');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a step\'s own write in a gated job', () => {
  it('keeps the job\'s gate', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'tool', globs: ['tool/**'], role: 'code' }, { name: 'docs', globs: ['docs/**'], role: 'data' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/gated-shell-writes' });
    assert.ok(markdown.includes('When run by hand, it writes to docs/baseline.json.'), markdown);
    assert.ok(!markdown.includes('\n2. It writes to docs/baseline.json.'), markdown);
  });
});
