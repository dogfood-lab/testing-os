import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/docs-gate: a paths-ignore companion workflow whose job only
// echoes (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/docs-gate');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a docs gate', () => {
  it('says the paths its trigger ignores, and that it runs only echo', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/docs-gate' });
    assert.ok(markdown.includes('2. **CI (docs gate).** On a pull request to main except when only src/** changes. Runs only echo.'), markdown);
    assert.ok(markdown.includes('**CI (docs gate)** runs only echo.'), markdown);
    assert.equal(JSON.parse(json).doors.find((door) => door.name === 'CI (docs gate)').echoOnly, true);
  });
});
