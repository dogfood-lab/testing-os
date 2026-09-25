import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unrun-gate: a root gate script no workflow runs (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unrun-gate');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a gate script no workflow runs', () => {
  it('is named', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'tests', globs: ['tests/**'], role: 'test' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }] }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unrun-gate' });
    assert.ok(markdown.includes('verify.sh runs in no workflow.'), markdown);
  });
});
