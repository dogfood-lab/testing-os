import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/private-command: a command a private package declares
// (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/private-command');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a private package\'s command', () => {
  it('says nothing ships it, and not that people run it', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'test', globs: ['test/**'], role: 'test' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/private-command' });
    assert.ok(markdown.includes('tool is a command of a private package (nothing ships it).'), markdown);
    assert.ok(!markdown.includes('People run tool.'), markdown);
    assert.ok(markdown.includes('**tool** (a command of a private package, which nothing ships).'), markdown);
  });
});
