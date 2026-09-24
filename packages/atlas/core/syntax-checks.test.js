import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/syntax-checks: a workflow that only syntax-checks files.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/syntax-checks');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a syntax check', () => {
  it('checks the file it is handed and runs nothing', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const ci = mapRepository({ repoPath: root, boundaries: [] }).doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.runs.map((run) => `${run.path} ${run.runKind}`), [
      'bin/tool.js checks',
      'lib/ checks',
      'run.sh checks',
      'tool.py checks',
    ]);
    assert.equal(ci.checksCount, 4);
  });
});
