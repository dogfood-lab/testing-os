import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/shipped-actions: a root action.yml and an action under
// .github/actions/ that no workflow here uses, beside one CI uses (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/shipped-actions');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an action a repository ships', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/shipped-actions' });

  it('is a door other repositories use, running what its steps run through github.action_path', () => {
    assert.ok(markdown.includes('2. **Dependency audit** (an action other repositories use). Runs scripts/audit.mjs.'), markdown);
    assert.ok(markdown.includes('3. **Renderer** (an action other repositories use). Runs scripts/render.mjs.'), markdown);
    assert.ok(markdown.includes('Other repositories use the Dependency audit and Renderer actions.'), markdown);
  });

  it('is no door when this repository\'s own workflow uses it', () => {
    assert.deepEqual(structure.doors.map((door) => door.file), ['.github/actions/audit/action.yml', '.github/workflows/ci.yml', 'action.yml']);
  });
});
