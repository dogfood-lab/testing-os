import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';

// fixtures/atlas/test-spawn-joined: a test runs a script through a command
// line held in a const, its path joined from the test's directory (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/test-spawn-joined');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a test that runs a script through a joined path', () => {
  it('runs the script, so its part is touched by a test through the spawn', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.ok(ci.runs.some((run) => run.path === 'scripts/query.mjs'), JSON.stringify(ci.runs));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/test-spawn-joined' });
    assert.ok(!markdown.includes('**scripts** is imported by no test'), markdown);
    assert.ok(markdown.includes('scripts is touched by tests only through a spawn: a test runs its files as a child process.'), markdown);
  });
});
