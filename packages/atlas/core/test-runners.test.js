import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// The runner behind each test run a workflow makes, followed through the
// package scripts, shell scripts, makefile targets and local reusable
// workflows that start it (docs/atlas-test-gaps.spec.md, build order 1). A
// step that runs tests through a runner Atlas cannot name reads "not
// attributed", never absent. Each shape has its own fixture under
// fixtures/atlas/runners-*.

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function doorsOf(fixture) {
  const root = makeRepo(resolve(FIXTURES, fixture));
  roots.push(root);
  return mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'], role: 'code' }] }).doors;
}

function testsOf(doors, file) {
  const door = doors.find((entry) => entry.file === file);
  assert.ok(door, `no door for ${file}`);
  return door.tests ?? [];
}

describe('runner attribution', () => {
  it('attributes Vitest inside npm run verify to Vitest, through both scripts (roll\'s shape)', () => {
    assert.deepEqual(testsOf(doorsOf('runners-verify'), '.github/workflows/ci.yml'), [
      { job: 'test', step: 'Verify', runner: 'vitest', through: ['npm run verify', 'npm test'], files: 1 },
    ]);
  });

  it('follows nested npm scripts to Jest', () => {
    assert.deepEqual(testsOf(doorsOf('runners-npm-nested'), '.github/workflows/ci.yml'), [
      { job: 'test', step: 'Test', runner: 'jest', through: ['npm test', 'npm run test:unit'], files: 1 },
    ]);
  });

  it('follows nested pnpm scripts to Vitest, and reads its --coverage', () => {
    assert.deepEqual(testsOf(doorsOf('runners-pnpm-nested'), '.github/workflows/ci.yml'), [
      { job: 'check', step: 'Check', runner: 'vitest', through: ['pnpm run ci', 'pnpm test'], coverage: true, files: 1 },
    ]);
  });

  it('follows nested yarn scripts to Mocha', () => {
    assert.deepEqual(testsOf(doorsOf('runners-yarn-nested'), '.github/workflows/ci.yml'), [
      { job: 'test', step: 'Test', runner: 'mocha', through: ['yarn test', 'yarn run unit'], files: 1 },
    ]);
  });

  it('follows a shell script to pytest', () => {
    assert.deepEqual(testsOf(doorsOf('runners-shell-script'), '.github/workflows/ci.yml'), [
      { job: 'test', step: 'Tests', runner: 'pytest', through: ['scripts/test.sh'], files: 1 },
    ]);
  });

  it('follows a makefile target to node --test', () => {
    assert.deepEqual(testsOf(doorsOf('runners-makefile'), '.github/workflows/ci.yml'), [
      { job: 'test', step: '1', runner: 'node --test', through: ['make test'], files: 1 },
    ]);
  });

  it('follows a local reusable workflow to the runner its job starts', () => {
    const doors = doorsOf('runners-local-workflow');
    assert.deepEqual(testsOf(doors, '.github/workflows/main.yml'), [
      { job: 'tests/unit', step: 'Unit tests', runner: 'vitest', through: ['.github/workflows/tests.yml', 'npm test'], files: 1 },
    ]);
    assert.deepEqual(testsOf(doors, '.github/workflows/tests.yml'), [
      { job: 'unit', step: 'Unit tests', runner: 'vitest', through: ['npm test'], files: 1 },
    ]);
  });

  it('says a test step whose runner it cannot name is not attributed, and leaves out a step that runs no tests', () => {
    assert.deepEqual(testsOf(doorsOf('runners-unattributed'), '.github/workflows/ci.yml'), [
      { job: 'checks', step: 'Run tests', runner: null, through: ['make check'] },
      { job: 'checks', step: '3', runner: null, through: ['npm test'] },
      { job: 'checks', step: 'Integration tests', runner: null, through: ['scripts/ci.sh', 'scripts/run-suite.sh'] },
    ]);
  });

  it('names a runner it reads none of the configuration of, with no count of its tests', () => {
    assert.deepEqual(testsOf(doorsOf('runners-named'), '.github/workflows/ci.yml'), [
      { job: 'e2e', step: 'End to end', runner: 'playwright test' },
      { job: 'e2e', step: 'End to end through pnpm', runner: 'playwright test' },
      { job: 'go', step: '1', runner: 'go test' },
      { job: 'tox', step: '1', runner: 'tox' },
      { job: 'direct', step: '1', runner: 'node', files: 1 },
      { job: 'direct', step: '2', runner: 'python', files: 1 },
    ]);
  });
});

describe('Vitest --dir', () => {
  it('looks for tests only under the directory --dir names', () => {
    const doors = doorsOf('runners-vitest-dir');
    const ci = doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.runs.map((run) => run.path), ['src/wrap.test.ts']);
    assert.deepEqual(testsOf(doors, '.github/workflows/ci.yml'), [
      { job: 'test', step: 'Test', runner: 'vitest', through: ['npm test'], files: 1 },
    ]);
  });
});

describe('coverage and JUnit results', () => {
  it('reads them from wrappers, flags, a step\'s environment and a runner\'s configuration', () => {
    assert.deepEqual(testsOf(doorsOf('runners-coverage'), '.github/workflows/ci.yml'), [
      { job: 'node-c8', step: 'Node tests with c8', runner: 'node --test', coverage: true, files: 2 },
      { job: 'vitest-flags', step: 'Vitest', runner: 'vitest', through: ['npm run test:ci'], coverage: true, junit: true, files: 4 },
      { job: 'node-env', step: 'Node tests under the environment', runner: 'node --test', coverage: true, junit: true, files: 2 },
      { job: 'pytest-flags', step: 'Pytest', runner: 'pytest', coverage: true, junit: true, files: 1 },
      { job: 'pytest-config', step: 'Pytest from its configuration', runner: 'pytest', dir: 'py', config: 'py/pyproject.toml', coverage: true, junit: true, files: 1 },
      { job: 'plain', step: 'Plain tests', runner: 'node --test', files: 2 },
      { job: 'vitest-config', step: 'Vitest from its configuration', runner: 'vitest', dir: 'web', config: 'web/vitest.config.ts', coverage: true, junit: true, files: 1 },
      { job: 'jest-config', step: 'Jest from its configuration', runner: 'jest', dir: 'jest', config: 'jest/jest.config.js', coverage: true, junit: true, files: 1 },
    ]);
  });
});
