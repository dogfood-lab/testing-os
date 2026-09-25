import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/godot-discovery: a runner that finds its tests under
// res://tests at run time (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/godot-discovery');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a Godot runner that finds its tests at run time', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'stage', globs: ['stage/**'], role: 'code' },
    { name: 'tests', globs: ['tests/**'], role: 'test' },
    { name: 'tools', globs: ['tools/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/godot-discovery' });
  const data = JSON.parse(page.json);
  const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');

  it('runs each script the runner finds under the directory it lists, and no other', () => {
    const found = ci.runs.filter((run) => run.foundBy === 'tools/headless.gd').map((run) => run.path);
    assert.deepEqual(found, ['tests/test_math.gd', 'tests/test_stage.gd']);
    assert.ok(ci.reach.some((entry) => entry.boundary === 'stage'), JSON.stringify(ci.reach));
  });

  it('says the door runs the runner, which runs the suites it finds', () => {
    assert.match(page.markdown, /\*\*ci\.\*\* On a pull request\. Runs tools\/headless\.gd, which runs the 2 test suites under tests\/ it finds at run time\./);
    assert.ok(page.markdown.includes('tools/headless.gd runs the 2 test suites under tests/ it finds at run time.'), page.markdown);
    const door = data.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    assert.deepEqual(door.runs, ['tools/headless.gd']);
    assert.deepEqual(door.found, [{ by: 'tools/headless.gd', what: 'the 2 test suites under tests/' }]);
  });

  it('counts the runner\'s load of what it finds as no path built at run time', () => {
    assert.ok(!data.limits.some((line) => line.includes('built at run time')), data.limits.join('\n'));
  });
});
