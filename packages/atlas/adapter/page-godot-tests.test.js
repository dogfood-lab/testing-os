import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/godot-tests: a GUT test, a gdUnit4 suite outside any test
// directory, a helper beside it and a script no test touches (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/godot-tests');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'checks', globs: ['checks/**'], role: 'test' },
    { name: 'inventory', globs: ['scripts/inventory.gd'], role: 'code' },
    { name: 'lonely', globs: ['scripts/lonely.gd'], role: 'code' },
    { name: 'player', globs: ['scripts/player.gd'], role: 'code' },
    { name: 'root', globs: ['*'], role: 'config' },
    { name: 'test', globs: ['test/**'], role: 'test' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/godot-tests' });
  return { structure, markdown: page.markdown };
}

describe('how a Godot project is tested', () => {
  const { structure, markdown } = mapped();
  const part = (name) => structure.boundaries.find((boundary) => boundary.name === name);

  it('counts a GUT test and a gdUnit4 suite as tests, wherever the suite is kept, and a helper as none', () => {
    assert.equal(structure.testFiles, 2);
    assert.equal(part('player').testedBy, 1);
    assert.equal(part('inventory').testedBy, 1);
    assert.equal(part('lonely').testedBy, 0);
    const suite = part('checks').files.find((file) => file.path === 'checks/inventory_suite.gd');
    assert.equal(suite.testSuite, true);
    assert.equal(part('checks').files.find((file) => file.path === 'checks/helper.gd').testSuite, undefined);
  });

  it('names the script no test touches', () => {
    const at = markdown.indexOf('## What no test touches');
    assert.match(markdown.slice(at, markdown.indexOf('\n## ', at + 1)), /^## What no test touches\n\n- \*\*lonely\*\* is imported by no test\.\n$/);
  });
});
