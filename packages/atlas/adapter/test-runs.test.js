import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { buildArtifact } from './artifact.js';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';

// structure.json carries each workflow's test runs as the core reads them
// (core/test-runners.test.js), so an answer read from the committed map can
// say which runner CI runs, through what, and with what.

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function structureOf(fixture) {
  const root = makeRepo(resolve(FIXTURES, fixture));
  roots.push(root);
  return buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'], role: 'code' }] }), '0'.repeat(40));
}

describe('a test file the runner\'s configuration leaves out', () => {
  it('is run by no workflow, and the map names the configuration that leaves it out', () => {
    const structure = structureOf('runners-vitest-exclude');
    assert.deepEqual(structure.testsNotRun, ['test/smoke/corpus.test.ts']);
    assert.deepEqual(structure.testsLeftOut, [{ path: 'test/smoke/corpus.test.ts', config: 'vitest.config.ts' }]);
  });
});

describe('test runs in structure.json', () => {
  it('carries the runner, the chain, and what the run collects', () => {
    const ci = structureOf('runners-coverage').doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.tests.find((run) => run.job === 'pytest-config'), {
      job: 'pytest-config', step: 'Pytest from its configuration', runner: 'pytest', dir: 'py', config: 'py/pyproject.toml', coverage: true, junit: true, files: 1,
    });
  });

  it('carries a test step Atlas cannot attribute with a null runner', () => {
    const ci = structureOf('runners-unattributed').doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.tests, [
      { job: 'checks', step: 'Run tests', runner: null, through: ['make check'] },
      { job: 'checks', step: '3', runner: null, through: ['npm test'] },
      { job: 'checks', step: 'Integration tests', runner: null, through: ['scripts/ci.sh', 'scripts/run-suite.sh'] },
      { job: 'checks', step: 'Headless suite', runner: null },
    ]);
  });
});
