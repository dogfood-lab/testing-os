import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/godot-lab: a Godot project named as a render lab (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/godot-lab');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a Godot project that is a lab', () => {
  it('is the Godot project, never the game', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'lab', globs: ['**'], role: 'code' }] }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/godot-lab' });
    assert.ok(markdown.includes('**the Godot project** (what Godot runs)'), markdown);
    assert.ok(!markdown.includes('the game'), markdown);
  });
});
