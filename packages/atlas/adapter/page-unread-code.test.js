import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unread-code: code parts of Astro and C# beside a Python
// tool its tests import (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unread-code');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function section(markdown, heading) {
  return markdown.split(`## ${heading}`)[1].split('\n## ')[0];
}

describe('a code part this map does not read', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'components', globs: ['components/**'], role: 'code' },
    { name: 'desktop', globs: ['desktop/**'], role: 'code' },
    { name: 'tool', globs: ['tool/**'], role: 'code' },
    { name: 'tests', globs: ['tests/**'], role: 'test' },
    { name: 'root', globs: ['*'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unread-code' });

  it('still appears in what breaks what', () => {
    assert.ok(section(markdown, 'What breaks what').includes('components and desktop hold only Astro and C# files, which this map does not read, so what uses them cannot be seen.'), markdown);
  });

  it('is never counted among the parts a test imports', () => {
    const untested = section(markdown, 'What no test touches');
    assert.ok(untested.includes('Every code part this map reads is imported by at least one test.'), untested);
    assert.ok(untested.includes('components and desktop hold only Astro and C# files, which this map does not read, so whether a test touches them cannot be seen.'), untested);
    assert.deepEqual(JSON.parse(json).unreadCode, ['components', 'desktop']);
  });
});
