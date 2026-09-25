import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/vitest-projects: pnpm vitest run with no script of that
// name, and a root vitest config whose projects are the packages (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/vitest-projects');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('pnpm running a binary, and vitest projects', () => {
  it('runs vitest through pnpm, and every project\'s tests by its own config', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const { doors } = mapRepository({ repoPath: root, boundaries: [{ name: 'packages', globs: ['packages/**'], role: 'code' }] });
    const ci = doors.find((door) => door.file === '.github/workflows/ci.yml');
    const runs = ci.runs.filter((run) => run.runKind !== 'checks').map((run) => run.path).sort();
    // packages/a's config includes only *.check.ts, so its a.test.ts is not run; every
    // file under packages/b/test/ runs, and the run is kept as that directory.
    assert.deepEqual(runs, ['packages/a/src/a.check.ts', 'packages/b/test/']);
  });
});
