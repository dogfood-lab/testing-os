import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { mapRepository } from './index.js';
import { DOORS_PY, DOORS_TS, makeRepo } from './fixture-repo.js';

// Doors read by the conventions of the tools they run. doors-py is a Python
// repository (pytest, uv, ruff, a verify script, a makefile, PyPI and image
// publishing); doors-ts is a TypeScript one whose tools name no file and read
// their configuration (tsc, vitest, eslint, jest, mocha, node --test).

const roots = [];

function boundaries(fixture) {
  return parse(readFileSync(join(fixture, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries;
}

function map(fixture, root = makeRepo(fixture)) {
  roots.push(root);
  return mapRepository({ repoPath: root, boundaries: boundaries(fixture) });
}

function door(doors, name) {
  const found = doors.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

// A run is executed unless it says otherwise, so only a checked run's kind is
// kept in what the cases compare.
function job(found, name) {
  return found.runs.filter((run) => run.job === name).map(({ job: _job, runKind, ...run }) => (runKind === 'checks' ? { ...run, runKind } : run));
}

let py;
let ts;

before(() => {
  py = map(DOORS_PY).doors;
  ts = map(DOORS_TS).doors;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('doors in a Python repository', () => {
  it('runs the directory pytest is handed, and never the value of a flag', () => {
    const ci = door(py, 'CI');
    assert.deepEqual(job(ci, 'test'), [{ path: 'tests/', directory: true }]);
    assert.ok(ci.mentions.some((mention) => mention.path === 'pyproject.toml' && mention.job === 'test'));
  });

  it('reads uv run as the command after it, and a bare pytest as its configured testpaths', () => {
    assert.deepEqual(job(door(py, 'CI'), 'uv'), [
      { path: 'tests/', directory: true, matched: true, via: 'pytest pyproject.toml' },
    ]);
  });

  it('runs the file python -m names by its dotted module path', () => {
    assert.deepEqual(job(door(py, 'CI'), 'build'), [{ path: 'tool/build.py' }]);
  });

  it('runs what a checker is pointed at: ruff over src/, bandit over scripts/ with its config a mention', () => {
    const ci = door(py, 'CI');
    assert.deepEqual(job(ci, 'lint'), [{ path: 'src/', directory: true, runKind: 'checks' }]);
    assert.deepEqual(job(ci, 'scan'), [{ path: 'scripts/', directory: true, runKind: 'checks' }]);
    assert.ok(ci.mentions.some((mention) => mention.path === 'bandit.yaml' && mention.job === 'scan'));
  });

  it('reads a shell script the door runs as one more level of commands, marked with via', () => {
    assert.deepEqual(job(door(py, 'CI'), 'verify'), [
      { path: 'scripts/check.py', via: 'verify.sh' },
      { path: 'verify.sh' },
    ]);
  });

  it('reads a make target and its prerequisites, with the makefile variables spelled out', () => {
    // make -j 2 lint: the 2 is the flag's count, not a target, and the
    // unused target's recipe is never read.
    assert.deepEqual(job(door(py, 'CI'), 'make'), [
      { path: 'scripts/types.py', via: 'Makefile', runKind: 'checks' },
      { path: 'tool/', directory: true, via: 'Makefile', runKind: 'checks' },
    ]);
    assert.equal(door(py, 'CI').runs.some((run) => run.path === 'scripts/unused.py'), false);
  });

  it('follows wrappers to the command they run, and runs nothing an installer or an echo names', () => {
    // ruff, black and mypy read what they are pointed at; python and pytest run it.
    assert.deepEqual(job(door(py, 'CI'), 'wrappers'), [
      { path: 'scripts/check.py', runKind: 'checks' },
      { path: 'scripts/smoke.py' },
      { path: 'tests/test_core.py' },
      { path: 'tool/', directory: true, runKind: 'checks' },
      { path: 'tool/build.py', runKind: 'checks' },
    ]);
    // pip install pytest ruff and echo "pytest runs tests/ next" share the
    // test job with the real pytest line, which runs tests/ and nothing else.
    assert.deepEqual(job(door(py, 'CI'), 'test').map((run) => run.path), ['tests/']);
  });

  it('expands a directory run to the code files under it when walking reach', () => {
    assert.deepEqual(door(py, 'CI').reach, [
      { boundary: 'root', depth: 0, files: 1 },
      { boundary: 'scripts', depth: 0, files: 4 },
      { boundary: 'src', depth: 0, files: 2 },
      { boundary: 'tests', depth: 0, files: 2 },
      { boundary: 'tool', depth: 0, files: 2 },
    ]);
    assert.equal(door(py, 'CI').runsCount, 10);
  });

  it('records what a door publishes, by action and by command', () => {
    assert.deepEqual(door(py, 'Publish').sends.publishesTo, ['container image', 'pypi']);
    assert.equal(door(py, 'Publish').sends.publishes, true);
    // build-push-action with push: false builds an image without sending it.
    assert.deepEqual(door(py, 'Image smoke').sends.publishesTo, []);
    assert.equal(door(py, 'Image smoke').sends.publishes, false);
  });

  it('records an issue a door opens, and whether it opens one only when something failed', () => {
    const nightly = door(py, 'Nightly').sends;
    assert.equal(nightly.opensIssues, true);
    assert.equal(nightly.opensIssuesOnFailure, true);
    // always() && (failure || cancelled) can hold on a cancelled run.
    const smoke = door(py, 'Image smoke').sends;
    assert.equal(smoke.opensIssues, true);
    assert.equal(smoke.opensIssuesOnFailure, false);
    assert.equal(door(py, 'Baseline').sends.opensPullRequests, true);
    assert.equal(door(py, 'CI').sends.opensIssues, false);
  });

  it('spells out a staged variable from the step, the job and the workflow, and keeps one set at run time', () => {
    const baseline = door(py, 'Baseline');
    assert.deepEqual(baseline.stages, ['$RUNTIME_PATH', 'reports/baseline.txt', 'reports/run.log', 'reports/summary.md']);
    // It pushes HEAD to the baseline branch and opens a pull request for it.
    assert.equal(baseline.pushes, false);
    assert.equal(baseline.pushesForReview, true);
  });

  it('keeps tag and branch filters on one push trigger, and a release trigger its types', () => {
    assert.deepEqual(door(py, 'CI').triggers, [
      { event: 'pull_request', paths: ['src/**', 'tests/**'] },
      { event: 'push', branches: ['main'], tags: ['v*'] },
      { event: 'workflow_dispatch' },
    ]);
    assert.deepEqual(door(py, 'Publish').triggers, [{ event: 'release', types: ['published'] }]);
  });
});

describe('doors in a TypeScript repository', () => {
  it('follows tsc --build through project references: an include directory, and files inherited through extends', () => {
    assert.deepEqual(job(door(ts, 'CI'), 'build'), [
      { path: 'packages/app/src/main.ts', matched: true, via: 'tsc tsconfig.json', runKind: 'checks' },
      { path: 'packages/core/src/', directory: true, matched: true, via: 'tsc tsconfig.json', runKind: 'checks' },
    ]);
  });

  it('reads the project tsc -p names, matching its include pattern against the tracked files', () => {
    assert.deepEqual(job(door(ts, 'CI'), 'types'), [
      { path: 'packages/core/src/core.test.ts', matched: true, via: 'tsc tsconfig.tests.json', runKind: 'checks' },
    ]);
  });

  it('reads vitest test.include, not coverage.exclude or a commented-out include', () => {
    assert.deepEqual(job(door(ts, 'CI'), 'test'), [
      { path: 'packages/core/src/core.test.ts', matched: true, via: 'vitest vitest.config.ts' },
    ]);
  });

  it('runs every code file eslint lints, written as the directories they fill, less what the config ignores', () => {
    assert.deepEqual(job(door(ts, 'CI'), 'lint'), [
      { path: 'bin/', directory: true, matched: true, via: 'eslint eslint.config.js', runKind: 'checks' },
      { path: 'eslint.config.js', matched: true, via: 'eslint eslint.config.js', runKind: 'checks' },
      { path: 'packages/', directory: true, matched: true, via: 'eslint eslint.config.js', runKind: 'checks' },
      { path: 'scripts/', directory: true, matched: true, via: 'eslint eslint.config.js', runKind: 'checks' },
      { path: 'test/', directory: true, matched: true, via: 'eslint eslint.config.js', runKind: 'checks' },
      { path: 'tools/', directory: true, matched: true, via: 'eslint eslint.config.js', runKind: 'checks' },
      { path: 'vitest.config.ts', matched: true, via: 'eslint eslint.config.js', runKind: 'checks' },
    ]);
  });

  it('reads the commands a script hands a child process when they are written out in full', () => {
    // pattern.exec('npx vitest run') is a regular expression, and a command
    // built from process.argv is not spelled in the file.
    assert.deepEqual(job(door(ts, 'CI'), 'gate'), [
      { path: 'scripts/gate.mjs' },
      { path: 'scripts/helper.mjs', via: 'scripts/gate.mjs' },
      { path: 'scripts/proof.ts', matched: true, via: 'scripts/gate.mjs → tsc scripts/proof.tsconfig.json', runKind: 'checks' },
    ]);
  });

  it('runs node --test with no path over its default patterns, from the working directory', () => {
    assert.deepEqual(job(door(ts, 'CI'), 'node-test'), [
      { path: 'tools/check.test.js', matched: true, via: 'node --test' },
    ]);
  });

  it('reads mocha from .mocharc and jest from its config, keeping jest to the path it is handed', () => {
    const ci = door(ts, 'CI');
    assert.deepEqual(job(ci, 'mocha'), [{ path: 'test/', directory: true, matched: true, via: 'mocha .mocharc.yml' }]);
    assert.deepEqual(job(ci, 'jest'), [{ path: 'packages/app/src/app.jest.ts', matched: true, via: 'jest jest.config.json' }]);
  });

  it('runs a package binary through its bin entry, and the scripts tsx, node --import, deno run and bun start', () => {
    assert.deepEqual(job(door(ts, 'CI'), 'runners'), [
      { path: 'bin/tool.js' },
      { path: 'scripts/bun-task.ts' },
      { path: 'scripts/deno-task.ts' },
      { path: 'scripts/loaded.ts' },
      { path: 'scripts/register.mjs' },
      { path: 'scripts/task.ts' },
    ]);
  });

  it('records npm publishing, an image pushed by buildx across a continued line, a release action and a pages action', () => {
    const release = door(ts, 'Release').sends;
    assert.deepEqual(release.publishesTo, ['container image', 'npm']);
    // On a release event the release action works on the release that started
    // the run; it creates none.
    assert.equal(release.releases, false);
    assert.equal(door(ts, 'Docs').sends.deploysPages, true);
    assert.deepEqual(job(door(ts, 'Docs'), 'build'), [{ path: 'site/build.js' }]);
  });

  it('describes the same doors byte for byte from a second copy of each fixture', () => {
    assert.equal(JSON.stringify(map(DOORS_PY).doors), JSON.stringify(py));
    assert.equal(JSON.stringify(map(DOORS_TS).doors), JSON.stringify(ts));
  });
});

describe('a door that runs more than the map records', () => {
  it('keeps the first 200 paths and counts every one', () => {
    // Test files interleaved with a file no pattern selects cannot be written
    // as their directory, so each is its own run.
    const root = mkdtempSync(resolve(tmpdir(), 'atlas-many-'));
    cpSync(DOORS_TS, root, { recursive: true });
    const dir = join(root, 'packages', 'core', 'src', 'many');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'keep.ts'), 'export const keep = 1;\n');
    for (let i = 0; i < 205; i += 1) writeFileSync(join(dir, `case${String(i).padStart(3, '0')}.test.ts`), `export const n = ${i};\n`);
    const git = (args) => assert.equal(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).status, 0, args.join(' '));
    git(['init']);
    git(['add', '-A']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'many']);
    const ci = door(map(DOORS_TS, root).doors, 'CI');
    const paths = new Set(ci.runs.map((run) => run.path));
    assert.equal(paths.size, 200);
    assert.equal(ci.runsCount, 226);
    assert.ok(ci.runs.some((run) => run.path === 'packages/core/src/many/case000.test.ts'));
  });
});
