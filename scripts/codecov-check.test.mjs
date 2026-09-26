import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkRecipe, readRecipeFiles } from './lib/codecov/check.mjs';
import { CODECOV_YML } from './lib/codecov/recipe.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

// A test job and a codecov job as recipe v2 has them, for a pytest
// repository (comfy-headless's shape).
const PILOT = `name: CI
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'codecov.yml'
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.11', '3.12']
    env:
      COVERAGE_LEG: \${{ matrix.python-version == '3.11' && (github.event_name == 'pull_request' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch)) }}
    steps:
      - uses: actions/checkout@v7
      - name: Run tests
        id: tests
        run: pytest tests/ --cov=pkg --cov-report=xml --junitxml=junit.xml
      - name: Save coverage for Codecov
        if: \${{ env.COVERAGE_LEG == 'true' }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: codecov-coverage
          path: coverage.xml
          if-no-files-found: error
          retention-days: 3
          overwrite: true
      - name: Save test results for Codecov
        if: \${{ !cancelled() && env.COVERAGE_LEG == 'true' && steps.tests.outcome != 'skipped' }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: codecov-test-results
          path: junit.xml
          if-no-files-found: error
          retention-days: 3
          overwrite: true
  codecov:
    needs: test
    if: \${{ !cancelled() && needs.test.result != 'cancelled' && needs.test.result != 'skipped' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - name: Download coverage
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          pattern: codecov-coverage
          path: .
      - name: Download test results
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          pattern: codecov-test-results
          path: .
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@303a32d7a59b442fa8d48b6a1cc6825c09c847a5 # v7.1.1
        with:
          version: v11.3.1
          use_oidc: true
          fail_ci_if_error: true
          disable_search: true
          files: ./coverage.xml
      - name: Upload test results to Codecov
        uses: codecov/codecov-action@303a32d7a59b442fa8d48b6a1cc6825c09c847a5 # v7.1.1
        with:
          version: v11.3.1
          use_oidc: true
          fail_ci_if_error: true
          report_type: test_results
          disable_search: true
          files: ./junit.xml
`;

// A Codecov step inside the test job, as wave 1 has it: a movable tag, no
// OIDC, failures swallowed, a token, no test results.
const WAVE_ONE = `name: CI
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
  pull_request:
    paths:
      - 'src/**'
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v6
        with:
          token: \${{ secrets.CODECOV_TOKEN }}
`;

function files(entries) {
  return new Map(Object.entries(entries));
}

describe('the recipe v2 check', () => {
  it('passes a repository on recipe v2', () => {
    const result = checkRecipe(files({ '.github/workflows/ci.yml': PILOT, 'codecov.yml': CODECOV_YML }));
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.notes, [
      `ci.yml job test: saves codecov-coverage if \${{ env.COVERAGE_LEG == 'true' }}`,
      `ci.yml job test: saves codecov-test-results if \${{ !cancelled() && env.COVERAGE_LEG == 'true' && steps.tests.outcome != 'skipped' }}`,
    ]);
  });

  it('passes this repository, which is on recipe v2', () => {
    assert.deepEqual(checkRecipe(readRecipeFiles(ROOT)).problems, []);
  });

  it('names every way a wave-one repository differs', () => {
    const result = checkRecipe(files({ '.github/workflows/ci.yml': WAVE_ONE }));
    assert.deepEqual(result.problems, [
      'ci.yml job build: its permissions are not exactly contents: read and id-token: write',
      'ci.yml job build: it has a run: step',
      'ci.yml job build: its checkout keeps credentials (persist-credentials is not false)',
      'ci.yml job build: codecov-action is at codecov/codecov-action@v6, not 303a32d7 (v7.1.1)',
      'ci.yml job build: an upload has version unset, not v11.3.1',
      'ci.yml job build: an upload has use_oidc unset, not true',
      'ci.yml job build: an upload has fail_ci_if_error unset, not true',
      'ci.yml job build: an upload has disable_search unset, not true',
      'ci.yml job build: an upload names no files',
      'ci.yml job build: an upload passes a token',
      'ci.yml job build: it uploads coverage only; recipe v2 uploads coverage and test_results',
      'ci.yml: the push paths filter leaves out codecov.yml',
      'ci.yml: the pull_request paths filter leaves out codecov.yml',
      'no codecov.yml',
    ]);
  });

  it('says so when no job uploads to Codecov', () => {
    const plain = 'on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n';
    assert.deepEqual(checkRecipe(files({ '.github/workflows/ci.yml': plain })).problems, ['no job uses codecov/codecov-action']);
  });

  it('holds the saving job to the recipe', () => {
    const loose = PILOT.replace('retention-days: 3\n          overwrite: true\n      - name: Save test results', 'retention-days: 5\n      - name: Save test results');
    assert.deepEqual(checkRecipe(files({ '.github/workflows/ci.yml': loose, 'codecov.yml': CODECOV_YML })).problems, [
      'ci.yml job test: save codecov-coverage has retention-days 5, not 3',
      'ci.yml job test: save codecov-coverage has overwrite unset, not true',
    ]);
  });

  it('holds only the artifacts the codecov job downloads to the recipe', () => {
    const other = PILOT.replace('      - name: Save coverage for Codecov\n', '      - name: Save the audit report\n        uses: actions/upload-artifact@v4\n        with:\n          name: audit-report\n          path: audit.json\n          retention-days: 14\n      - name: Save coverage for Codecov\n');
    assert.deepEqual(checkRecipe(files({ '.github/workflows/ci.yml': other, 'codecov.yml': CODECOV_YML })).problems, []);
  });

  it('finds a download whose pattern matches nothing the tests saved', () => {
    const renamed = PILOT.replace('pattern: codecov-test-results', 'pattern: test-results');
    assert.deepEqual(checkRecipe(files({ '.github/workflows/ci.yml': renamed, 'codecov.yml': CODECOV_YML })).problems, [
      'ci.yml job codecov: the download pattern test-results matches no artifact job test saves',
    ]);
  });

  it('reads a paths filter the way GitHub does: a glob counts, a later exclusion wins, paths-ignore excludes', () => {
    const glob = PILOT.replace("      - 'codecov.yml'\n", "      - '*.yml'\n");
    assert.deepEqual(checkRecipe(files({ '.github/workflows/ci.yml': glob, 'codecov.yml': CODECOV_YML })).problems, []);
    const negated = PILOT.replace("      - 'codecov.yml'\n", "      - '*.yml'\n      - '!codecov.yml'\n");
    assert.deepEqual(checkRecipe(files({ '.github/workflows/ci.yml': negated, 'codecov.yml': CODECOV_YML })).problems, [
      'ci.yml: the push paths filter leaves out codecov.yml',
    ]);
    const ignored = PILOT.replace('  pull_request:\n', "  pull_request:\n    paths-ignore:\n      - '*.yml'\n");
    assert.deepEqual(checkRecipe(files({ '.github/workflows/ci.yml': ignored, 'codecov.yml': CODECOV_YML })).problems, [
      'ci.yml: the pull_request paths-ignore filter leaves out codecov.yml',
    ]);
  });

  it('holds codecov.yml to informational statuses and a comment without the project figure', () => {
    const strict = 'coverage:\n  status:\n    project:\n      default:\n        target: 80%\n';
    assert.deepEqual(checkRecipe(files({ '.github/workflows/ci.yml': PILOT, 'codecov.yml': strict })).problems, [
      'codecov.yml: the project status is not informational',
      'codecov.yml: the patch status is not informational',
      'codecov.yml: hide_project_coverage is not true',
    ]);
  });

  it('reads the workflows and codecov.yml from a checkout', () => {
    const read = readRecipeFiles(ROOT);
    assert.equal(read.get('codecov.yml'), readFileSync(join(ROOT, 'codecov.yml'), 'utf8'));
    assert.ok(read.has('.github/workflows/ci.yml'));
    assert.ok([...read.keys()].every((path) => path === 'codecov.yml' || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)));
  });

  it('keeps the codecov.yml it writes identical to this repository\'s', () => {
    assert.equal(CODECOV_YML, readFileSync(join(ROOT, 'codecov.yml'), 'utf8'));
  });
});
