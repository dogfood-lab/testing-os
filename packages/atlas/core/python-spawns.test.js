import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/python-spawns: modules run under the file's own
// interpreter, and python -c code (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/python-spawns');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('Python spawns and inline code', () => {
  it('runs what sys.executable -m runs, and what python -c imports', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'pkg', globs: ['pkg/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }];
    const { doors } = mapRepository({ repoPath: root, boundaries });
    const ci = doors.find((door) => door.file === '.github/workflows/ci.yml');
    const runs = ci.runs.map((run) => `${run.path} ${run.runKind}`).sort();
    assert.ok(runs.includes('pkg/check.py executes'), runs.join('\n'));
    assert.ok(runs.includes('tests/test_check.py executes') || runs.includes('tests/ executes'), runs.join('\n'));
    assert.ok(runs.includes('pkg/ checks'), runs.join('\n'));
    // gate.py hands mypy's command to its own _run, which runs it.
    assert.ok(ci.runs.some((run) => run.path === 'pkg/' && (run.via ?? '').includes('gate.py')), JSON.stringify(ci.runs));
  });
});
