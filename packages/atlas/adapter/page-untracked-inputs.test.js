import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/untracked-inputs: a file a script writes from an input this
// repository does not keep (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/untracked-inputs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function section(markdown, heading) {
  return markdown.split(`## ${heading}`)[1].split('\n## ')[0];
}

describe('a file written from inputs the repository does not keep', () => {
  it('is edited by people too, never generated', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'scripts', globs: ['scripts/**'], role: 'code' },
      { name: 'src', globs: ['src/**'], role: 'code' },
      { name: 'root', globs: ['*'], role: 'config' },
    ];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/untracked-inputs' });
    assert.equal(section(markdown, 'Generated, never hand-edited').trim(), 'Every tracked place code writes here is edited by people too; see Hand-authored.');
    assert.ok(section(markdown, 'Hand-authored').includes('- **src/game/data/events.json** is written by scripts/convert.py from inputs this repository does not keep, and by people.'), markdown);
  });
});
