import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { commandLines } from './commands.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/shell-arrays: a bash array of manifests handed to jq (see
// the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/shell-arrays');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a bash array of paths', () => {
  it('reads the array as one assignment, never its values as commands', () => {
    assert.deepEqual(commandLines('LIST=(\n  a/package.json\n  b/package.json\n)\necho done'), [['LIST=()'], ['echo', 'done']]);
  });

  it('runs no manifest the array lists or jq reads', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const { doors } = mapRepository({ repoPath: root, boundaries: [{ name: 'packages', globs: ['packages/**'], role: 'code' }] });
    const release = doors.find((door) => door.file === '.github/workflows/release.yml');
    assert.deepEqual(release.runs.filter((run) => run.runKind !== 'checks'), []);
  });
});
