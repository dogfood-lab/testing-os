import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/installed-cwd-writes: a command people install that a
// workflow also runs and whose output it partly commits (see the README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/installed-cwd-writes');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what an installed command writes where it runs', () => {
  it('is the person\'s, except what a workflow that runs it commits', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = ['.tool', 'bin', 'reports', 'src'].map((name) => ({ name, globs: [`${name}/**`], role: name === 'bin' || name === 'src' ? 'code' : 'data' }));
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/installed-cwd-writes' });
    assert.ok(markdown.includes('- **reports/** is written by src/save.js.'), markdown);
    assert.ok(!markdown.includes('**.tool/** is written'), markdown);
    assert.ok(JSON.parse(json).limits.includes('1 write goes to the directory the command is run in (.tool/), not to this repository.'), JSON.parse(json).limits.join('\n'));
  });
});
