import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/spawned-parts: a python -m spawn from src into python/, and
// a git spawn with its arguments built at run time (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/spawned-parts');
const roots = [];
let mapped;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({
    repoPath: root,
    boundaries: [{ name: 'python', globs: ['python/**'], role: 'code' }, { name: 'src', globs: ['src/**'], role: 'code' }],
  });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a child process that runs another part', () => {
  it('is an edge from the spawning part, and the door that runs it reaches the part it runs', () => {
    assert.deepEqual(mapped.edges.filter((edge) => edge.kind === 'spawns'), [{ from: 'src', to: 'python', kind: 'spawns' }]);
    const ci = mapped.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.reach.map((entry) => entry.boundary), ['src', 'python']);
    assert.deepEqual(ci.programs, ['git']);
  });

  it('is said under What breaks what, and git is said as run with no edge and not as a command built at run time', () => {
    const structure = buildArtifact(mapped, '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/spawned-parts' });
    assert.ok(markdown.includes('- **python** is run as a child process by 1 part (src) and sits on the path of 1 door.'), markdown);
    assert.ok(markdown.includes('It runs git.'), markdown);
    assert.doesNotMatch(markdown, /built at run time and not followed/);
  });
});
