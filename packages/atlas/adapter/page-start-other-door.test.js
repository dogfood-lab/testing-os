import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/start-other-door: the busiest door runs no code, and a
// second pull-request door runs a check of what a script writes (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/start-other-door');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('where to start when the busiest door runs no code', () => {
  it('follows the pull request door that runs code, from its check to what it reads and who writes it', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = ['brand', 'docs', 'scripts'].map((name) => ({ name, globs: [`${name}/**`], role: name === 'scripts' ? 'code' : 'docs' }))
      .concat([{ name: 'root', globs: ['*', '.github/**'], role: 'config' }]);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const built = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/start-other-door' });
    const data = JSON.parse(built.json);
    assert.equal(data.mainDoor, '.github/workflows/guard.yml');
    assert.equal(data.startDoor, '.github/workflows/docs.yml');
    assert.deepEqual(data.startHere, ['.github/workflows/docs.yml', 'scripts/check-catalog.mjs', 'docs/catalog.yaml', 'scripts/build-catalog.mjs']);
    assert.equal(data.startReason, 'This path follows Docs Quality, since Guard runs no code this map can follow.');
    assert.ok(built.markdown.includes('Read those in order to follow one pull request end to end. This path follows Docs Quality, since Guard runs no code this map can follow.'), built.markdown);
  });
});
