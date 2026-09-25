import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/workspace-root: a command whose root is an imported
// constant, found at run time and falling back to the working directory
// (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/workspace-root');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function section(markdown, heading) {
  return markdown.split(`## ${heading}`)[1].split('\n## ')[0];
}

describe('a root that falls back to the working directory', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'lib', globs: ['lib/**'], role: 'code' },
    { name: 'scripts', globs: ['scripts/**', 'bin/**'], role: 'code' },
    { name: 'projects', globs: ['projects/**'], role: 'data' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/workspace-root' });

  it('is the user\'s place, so nothing here generates projects/', () => {
    assert.ok(!section(markdown, 'Generated, never hand-edited').includes('projects/'), markdown);
    assert.ok(!section(markdown, 'What happens through CI').includes('writes to projects/'), markdown);
    assert.ok(section(markdown, 'Hand-authored').includes('People write projects/'), markdown);
  });

  it('says where the writes go instead', () => {
    assert.ok(section(markdown, 'What this map cannot see').includes('- 2 writes go to the directory the command is run in or a path their caller passes, not to this repository.'), markdown);
  });
});
