import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { setAsideExpressions } from '../core/doors.js';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage, doorDetail, pageFacts } from './page.js';

// fixtures/atlas/unlisted-runs: test files a workflow runs that the page
// must not list as run in no workflow (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unlisted-runs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function map(name, parts) {
  const root = makeRepo(join(FIXTURE, name));
  roots.push(root);
  const boundaries = [
    ...parts.map((part) => ({ name: part, globs: [`${part}/**`], role: part === 'tests' || part === 'e2e' ? 'test' : 'code' })),
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: `fixture/${name}` });
  return { structure, markdown };
}

describe('a test step whose command holds an expression', () => {
  it('reads the runner without the expression, so pytest runs its testpaths', () => {
    const { structure, markdown } = map('pytest-expression', ['app', 'tests']);
    assert.ok(!markdown.includes('run in no workflow'), markdown);
    assert.ok(!markdown.includes('runs in no workflow'), markdown);
    const door = structure.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    const run = door.tests.find((entry) => entry.runner === 'pytest');
    assert.equal(run.files, 2);
    assert.equal(structure.testsNotRun, undefined);
  });

  it('notes what the expression could add, never guessing it, and never republishes its text', () => {
    const { structure } = map('pytest-expression', ['app', 'tests']);
    const door = structure.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    assert.deepEqual(door.unresolvedExpressions, [{ adds: 'flags', job: 'test', step: 'Test' }]);
    assert.ok(!JSON.stringify(structure).includes('COVERAGE_LEG'));
    const ctx = pageFacts({ structure, statistics: {} });
    const { lines } = doorDetail(ctx, ctx.doors.find((entry) => entry.file === '.github/workflows/ci.yml'));
    assert.ok(lines.includes('Not read as part of a command: in job `test`, "Test", an expression Actions spells out before the shell runs; it adds only flags, so the command is read without it.'), lines.join('\n'));
  });

  it('lists none of the files a runner runs when an expression it is handed may name them', () => {
    const { structure, markdown } = map('pytest-matrix', ['app', 'tests']);
    const door = structure.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    const run = door.tests.find((entry) => entry.runner === 'pytest');
    assert.equal(run.files, undefined);
    assert.deepEqual(door.unresolvedExpressions, [{ adds: 'words', job: 'test', step: 'Test' }]);
    assert.ok(!markdown.includes('in no workflow'), markdown);
  });

  it('sets aside only an expression every value of which is flags or nothing', () => {
    const recipe = "pytest -v ${{ env.LEG == 'true' && '--cov=app --cov-report=xml' || '' }} --junitxml=junit.xml";
    assert.deepEqual(setAsideExpressions(recipe), { text: 'pytest -v   --junitxml=junit.xml', adds: ['flags'] });
    // A value that is a path, or one not spelled in the expression, may
    // name the tests: the expression stays, a word the runner cannot read.
    for (const text of ["pytest ${{ matrix.suite }}", "pytest ${{ inputs.fast && 'tests/unit' || 'tests' }}"]) {
      assert.deepEqual(setAsideExpressions(text), { text, adds: ['words'] });
    }
    // Part of a word, the expression is that word's, as a workspace path is.
    assert.deepEqual(setAsideExpressions('node ${{ github.workspace }}/cli.js'), { text: 'node ${{ github.workspace }}/cli.js', adds: [] });
  });
});

describe('a runner Atlas names without listing its files', () => {
  it('keeps a test file it may run off the list of tests no workflow runs', () => {
    const { structure, markdown } = map('playwright', ['e2e', 'src']);
    const door = structure.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    assert.ok(door.tests.some((entry) => entry.runner === 'playwright test' && entry.files == null), JSON.stringify(door.tests));
    assert.ok(!markdown.includes('e2e/smoke.spec.ts runs in no workflow'), markdown);
  });
});
