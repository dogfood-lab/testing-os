import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/package-test-script: a launcher tested only by its own
// package's test script, which CI runs (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/package-test-script');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a package tested by its own test script', () => {
  it('is touched by a test, and the page says how', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'launcher', globs: ['launcher/**'], role: 'code' },
      { name: 'tool', globs: ['tool/**'], role: 'code' },
      { name: 'tests', globs: ['tests/**'], role: 'test' },
      { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    ];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/package-test-script' });
    const section = markdown.split('## What no test touches')[1].split('\n## ')[0];
    assert.ok(!section.includes('is imported by no test'), section);
    assert.ok(section.includes('Every code part is touched by at least one test.'), section);
    assert.ok(section.includes("launcher is tested only by its package's own test script, which a workflow runs."), section);
    assert.deepEqual(JSON.parse(json).testedByScript, ['launcher']);
  });
});
