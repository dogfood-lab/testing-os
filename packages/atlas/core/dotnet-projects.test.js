import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/dotnet-projects: dotnet test and dotnet publish in a
// workflow (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/dotnet-projects');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('dotnet in a workflow', () => {
  it('runs the test project and builds the one it publishes', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    const runs = mapped.doors.find((door) => door.file === '.github/workflows/desktop.yml').runs
      .map((run) => [run.path, run.runKind, run.built === true]);
    assert.deepEqual(runs, [['app/App.csproj', 'executes', true], ['tests/Tests.csproj', 'executes', false]]);
  });
});
