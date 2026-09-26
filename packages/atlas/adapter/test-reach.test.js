import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { buildArtifact } from './artifact.js';
import { testReachOf } from './test-reach.js';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';

// What tests reach, read from structure.json (docs/atlas-test-gaps.spec.md,
// "Reach, defined"): a test reaches a file when it imports it, directly or
// through the import graph; when it runs it as a process, by its path or by
// the command a manifest installs it as; or when a runner finds the tests
// the file holds. Every fact says which of the three it is and its basis.

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const PARTS = [
  { name: 'src', globs: ['src/**'], role: 'code' },
  { name: 'bin', globs: ['bin/**'], role: 'code' },
  { name: 'crate', globs: ['crate/**'], role: 'code' },
  { name: 'tests', globs: ['test/**'], role: 'code' },
  { name: 'e2e', globs: ['e2e/**'], role: 'code' },
];
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function structureOf(fixture, parts = PARTS) {
  const root = makeRepo(resolve(FIXTURES, fixture));
  roots.push(root);
  return buildArtifact(mapRepository({ repoPath: root, boundaries: parts }), '0'.repeat(40));
}

describe('reach, with its basis', () => {
  const structure = structureOf('reach-kinds');
  const reach = testReachOf(structure);

  it('says a file a test imports is reached by import, directly or through the graph', () => {
    assert.deepEqual(reach.files.get('src/direct.js'), { kind: 'imports', basis: 'parsed', test: 'test/direct.test.js' });
    assert.deepEqual(reach.files.get('src/deep.js'), { kind: 'imports', basis: 'parsed', test: 'test/helper.test.js', through: ['src/helper.js'] });
  });

  it('counts a mocked import as an import', () => {
    assert.deepEqual(reach.files.get('src/mocked.js'), { kind: 'imports', basis: 'parsed', test: 'test/mocked.test.js' });
  });

  it('says a file a test runs as a process is reached by run, by its path or by the command it is installed as', () => {
    assert.deepEqual(reach.files.get('bin/tool.js'), { kind: 'runs', basis: 'parsed', test: 'test/tool.test.js' });
    assert.deepEqual(reach.files.get('bin/cli.js'), { kind: 'runs', basis: 'declared', test: 'test/cli.test.js' });
  });

  it('keeps the run of a file a test also imports, apart from its stronger fact', () => {
    assert.deepEqual(reach.files.get('bin/both.js'), { kind: 'imports', basis: 'parsed', test: 'test/both.test.js' });
    assert.deepEqual(reach.ran.get('bin/both.js'), { kind: 'runs', basis: 'parsed', test: 'test/both.test.js' });
    assert.deepEqual(reach.ran.get('bin/cli.js'), { kind: 'runs', basis: 'declared', test: 'test/cli.test.js' });
    assert.equal(reach.ran.has('src/direct.js'), false);
  });

  it('says a file holding the tests a runner finds is reached by discovery', () => {
    assert.deepEqual(reach.files.get('crate/src/lib.rs'), { kind: 'discovers', basis: 'parsed' });
  });

  it('has no fact for a file no test imports or runs, and none for the tests themselves', () => {
    assert.equal(reach.files.has('src/unreached.js'), false);
    assert.equal(reach.files.has('test/direct.test.js'), false);
  });

  it('takes a test-shaped file among fixtures for data, which reaches nothing', () => {
    assert.equal(reach.files.has('fixtures/demo/src/demo.js'), false);
  });

  it('says how much of each code part is reached, and how', () => {
    assert.deepEqual(reach.parts.get('src'), { kind: 'imports', basis: 'parsed', reached: 4, files: 5 });
    assert.deepEqual(reach.parts.get('bin'), { kind: 'imports', basis: 'parsed', reached: 3, files: 3 });
    assert.deepEqual(reach.parts.get('crate'), { kind: 'discovers', basis: 'parsed', reached: 1, files: 1 });
    assert.equal(reach.parts.has('tests'), false);
  });
});

describe('the runners CI runs for each part', () => {
  it('names the runner whose tests reach a part, and none for a part CI\'s tests do not reach', () => {
    const structure = structureOf('reach-kinds');
    const runners = Object.fromEntries(structure.boundaries.map((boundary) => [boundary.name, boundary.testRunners ?? []]));
    assert.deepEqual(runners, { bin: ['vitest'], crate: [], e2e: [], src: ['vitest'], tests: ['vitest'] });
  });
});

describe('test files no workflow runs', () => {
  it('lists a test file no workflow\'s runs cover', () => {
    assert.deepEqual(structureOf('runners-vitest-dir').testsNotRun, ['e2e/flow.test.ts']);
  });

  it('lists none when every test file runs', () => {
    assert.equal(structureOf('reach-kinds').testsNotRun, undefined);
  });
});

// fixtures/atlas/reach-shapes: more ways the fleet's tests reach the file
// they test (see the fixture's README).
describe('the ways the fleet\'s tests reach a file', () => {
  const reach = testReachOf(structureOf('reach-shapes', [
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
    { name: 'tools', globs: ['tools/**'], role: 'code' },
    { name: 'npm', globs: ['npm/**'], role: 'code' },
    { name: 'test', globs: ['test/**'], role: 'test' },
  ]));

  it('reads an import of each path a test loops over from a table of them (style-dataset-lab)', () => {
    assert.equal(reach.files.get('scripts/alpha.js')?.kind, 'imports');
    assert.equal(reach.files.get('scripts/beta.js')?.kind, 'imports');
  });

  it('reads a fork as a run (testing-os)', () => {
    assert.equal(reach.files.get('scripts/worker.mjs')?.kind, 'runs');
  });

  it('follows helpers that hand Node an argument list (ai-rpg-engine, mcp-arcade-cabinets)', () => {
    assert.equal(reach.files.get('scripts/check.mjs')?.kind, 'runs');
    assert.equal(reach.files.get('scripts/sweep.mjs')?.kind, 'runs');
  });

  it('reads the program an environment variable names, or its default (style-dataset-lab)', () => {
    assert.equal(reach.files.get('tools/gen.py')?.kind, 'runs');
  });

  it('reads a file a test step runs with no runner Atlas names as run by that step (armature)', () => {
    assert.deepEqual(reach.files.get('npm/bin/launcher.mjs'), { kind: 'runs', basis: 'parsed', step: '.github/workflows/ci.yml › launcher › Launcher self-test' });
  });
});
