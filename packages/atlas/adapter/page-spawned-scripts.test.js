import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/spawned-scripts: tests that run the scripts part as a child
// process and import nothing in it (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/spawned-scripts');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = ['scripts', 'src', 'tests'].map((name) => ({ name, globs: [`${name}/**`], role: 'code' }));
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/spawned-scripts' });
  return { structure, markdown: page.markdown, data: JSON.parse(page.json) };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

describe('a test that runs a script as a child process', () => {
  const { structure, markdown, data } = mapped();

  it('touches the script, through tsx\'s cli under node and through node alone', () => {
    const scripts = structure.boundaries.find((boundary) => boundary.name === 'scripts');
    assert.equal(scripts.testedBy, 2);
    assert.equal(scripts.testedThroughSpawn, true);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'src').testedThroughSpawn, undefined);
  });

  it('says the part is touched, and only through a spawn', () => {
    const untested = section(markdown, 'What no test touches');
    assert.ok(untested.includes('\nEvery code part is touched by at least one test.\n'), untested);
    assert.ok(untested.includes('scripts is touched by tests only through a spawn: a test runs its files as a child process.'), untested);
    assert.deepEqual(data.spawnTested, ['scripts']);
    assert.deepEqual(data.untested, []);
  });
});
