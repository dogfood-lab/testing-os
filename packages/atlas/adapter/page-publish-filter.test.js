import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/publish-filter: pnpm publishing workspace members by
// --filter (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/publish-filter');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('pnpm publish --filter', () => {
  it('names the members it publishes, and gives each a package door', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = ['core', 'tools', 'ui'].map((name) => ({ name, globs: [`packages/${name}/**`], role: 'code' }));
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown, json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/publish-filter' });
    assert.ok(markdown.includes('It publishes @s/core (packages/core) and @s/ui (packages/ui) to npm.'), markdown);
    assert.ok(markdown.includes('People import @s/core and @s/ui.'), markdown);
    const doors = JSON.parse(json).doors.filter((door) => door.kind === 'package').map((door) => door.id).sort();
    assert.deepEqual(doors, ['packages/core/package.json#@s/core', 'packages/ui/package.json#@s/ui']);
  });
});
