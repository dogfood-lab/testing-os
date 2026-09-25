import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/private-publish: npm publish at a private root (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/private-publish');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('npm publish of a private package', () => {
  it('publishes nothing', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/private-publish' });
    assert.ok(!/publishes/.test(markdown), markdown);
    assert.deepEqual(structure.doors.find((door) => door.file === '.github/workflows/publish.yml').sends.publishesTo, []);
  });
});
