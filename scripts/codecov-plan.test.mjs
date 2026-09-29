import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkRecipe, fileReader, readRecipeFiles } from './lib/codecov/check.mjs';
import { atlasFacts } from './lib/codecov/facts.mjs';
import { planRepository } from './lib/codecov/plan.mjs';
import { CODECOV_YML } from './lib/codecov/recipe.mjs';

const FIXTURES = resolve(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/codecov');
const WORKFLOW = '.github/workflows/ci.yml';

function fixture(name) {
  const root = join(FIXTURES, name, 'repo');
  return { root, files: readRecipeFiles(root), read: fileReader(root), facts: atlasFacts(root), expected: readFileSync(join(FIXTURES, name, 'expected', WORKFLOW), 'utf8') };
}

// The repository as the plan leaves it: its recipe files with the plan's written in.
function after(files, plan) {
  const out = new Map(files);
  for (const file of plan.files) out.set(file.path, file.after);
  return out;
}

describe('the plan for a repository', () => {
  for (const name of ['vitest-pnpm', 'pytest-matrix', 'node-test-c8', 'no-matrix']) {
    it(`writes recipe v2 into ${name}, as the expected files have it`, () => {
      const { files, read, facts, expected } = fixture(name);
      const plan = planRepository({ files, read, facts });
      assert.deepEqual(plan.reasons, []);
      assert.equal(plan.status, 'ready');
      assert.deepEqual(plan.files.map((file) => file.path), [WORKFLOW, 'codecov.yml']);
      assert.equal(plan.files[0].before, files.get(WORKFLOW));
      assert.equal(plan.files[0].after, expected);
      assert.equal(plan.files[1].before, null);
      assert.equal(plan.files[1].after, CODECOV_YML);
      assert.deepEqual(checkRecipe(after(files, plan)).problems, []);
    });
  }

  it('adds to a literal block run at the same place in a checkout with CRLF line endings', () => {
    const { files, read, facts, expected } = fixture('pytest-matrix');
    const crlf = new Map(files);
    crlf.set(WORKFLOW, files.get(WORKFLOW).replaceAll('\n', '\r\n'));
    const plan = planRepository({ files: crlf, read, facts });
    assert.equal(plan.status, 'ready');
    assert.match(plan.files[0].after, /--cov-report=term-missing --junitxml=junit\.xml\r?\n/);
    assert.equal(plan.files[0].after.replaceAll('\r\n', '\n'), expected);
  });

  it('says what it changes, in plain words', () => {
    const { files, read, facts } = fixture('vitest-pnpm');
    const plan = planRepository({ files, read, facts });
    assert.deepEqual(plan.target, { workflow: WORKFLOW, job: 'ci', step: 'Test with coverage', runner: 'vitest' });
    assert.deepEqual(plan.changes, [
      "ci.yml job ci: COVERAGE_LEG is true where matrix.node-version == 22, on a pull request or a push to the default branch",
      'ci.yml step "Test with coverage": writes coverage to coverage/coverage-final.json and test results to junit.xml',
      'ci.yml job ci: two steps save them for Codecov on that leg',
      'ci.yml: the old Codecov upload "Upload coverage to Codecov" is removed',
      "ci.yml: a codecov job uploads both with OIDC, running none of the repository's code",
      'ci.yml: codecov.yml joins the push and pull_request paths filters',
      'codecov.yml: new; both statuses informational, the comment without the project figure',
    ]);
    assert.deepEqual(plan.atlas, { version: null, remap: false });
  });

  it('finds nothing to do in a repository it has already moved to recipe v2', () => {
    const { files, read, facts, expected } = fixture('vitest-pnpm');
    const moved = new Map(files);
    moved.set(WORKFLOW, expected);
    moved.set('codecov.yml', CODECOV_YML);
    const plan = planRepository({ files: moved, read, facts });
    assert.equal(plan.status, 'done');
    assert.deepEqual(plan.files, []);
  });

  it('predicts that Atlas must map again when codecov.yml falls in no part, and reads the pinned Atlas', () => {
    const { files, read } = fixture('vitest-pnpm');
    const facts = atlasFacts(fixture('vitest-pnpm').root);
    facts.boundaries = facts.boundaries.filter((boundary) => boundary.name !== 'root');
    const pinned = new Map(files);
    pinned.set(WORKFLOW, files.get(WORKFLOW).replace('      - run: pnpm install --frozen-lockfile\n', '      - run: pnpm install --frozen-lockfile\n\n      - run: npx --yes @dogfood-lab/atlas@1.17.0 check\n'));
    const plan = planRepository({ files: pinned, read, facts });
    assert.equal(plan.status, 'ready');
    assert.deepEqual(plan.atlas, { version: '1.17.0', remap: true });
  });

  it('keeps the leg the old upload used when the test step runs on every leg', () => {
    const { files, read, facts } = fixture('pytest-matrix');
    const everyLeg = new Map(files);
    everyLeg.set(WORKFLOW, files.get(WORKFLOW).replace("      - name: Run tests with coverage\n        if: matrix.python-version == '3.12'\n", '      - name: Run tests with coverage\n'));
    const plan = planRepository({ files: everyLeg, read, facts });
    assert.equal(plan.status, 'ready');
    assert.match(plan.files[0].after, /COVERAGE_LEG: \$\{\{ matrix\.python-version == '3\.12' && \(/);
  });

  it('puts the codecov job after the test job\'s own trailing comments and before the next job\'s', () => {
    const { files, read, facts } = fixture('vitest-pnpm');
    const commented = new Map(files);
    commented.set(WORKFLOW, files.get(WORKFLOW).replace('        run: pnpm smoke\n\n  audit:\n', '        run: pnpm smoke\n      # A note the test job ends with.\n\n  # A note about the audit job.\n  audit:\n'));
    const plan = planRepository({ files: commented, read, facts });
    assert.equal(plan.status, 'ready');
    assert.ok(plan.files[0].after.includes('      # A note the test job ends with.\n\n  codecov:\n'));
    assert.ok(plan.files[0].after.includes('          files: ./junit.xml\n\n  # A note about the audit job.\n  audit:\n'));
  });

  it('adds COVERAGE_LEG to an env the job already has, and NODE_OPTIONS to one the step has', () => {
    const vitest = fixture('vitest-pnpm');
    const jobEnv = new Map(vitest.files);
    jobEnv.set(WORKFLOW, vitest.files.get(WORKFLOW).replace('    timeout-minutes: 20\n', '    timeout-minutes: 20\n    env:\n      FORCE_COLOR: "1"\n'));
    const withJobEnv = planRepository({ files: jobEnv, read: vitest.read, facts: vitest.facts });
    assert.equal(withJobEnv.status, 'ready');
    assert.ok(withJobEnv.files[0].after.includes(`    env:\n      FORCE_COLOR: "1"\n      # 'true' on the one leg whose coverage and test results go to Codecov,\n      # on a pull request or a push to the default branch.\n      COVERAGE_LEG: \${{ matrix.node-version == 22 && (`));
    const node = fixture('node-test-c8');
    const stepEnv = new Map(node.files);
    stepEnv.set(WORKFLOW, node.files.get(WORKFLOW).replace('        run: npm run coverage\n', '        run: npm run coverage\n        env:\n          FORCE_COLOR: "1"\n'));
    const withStepEnv = planRepository({ files: stepEnv, read: node.read, facts: node.facts });
    assert.equal(withStepEnv.status, 'ready');
    assert.ok(withStepEnv.files[0].after.includes('        env:\n          FORCE_COLOR: "1"\n          # On the coverage leg the test runner also writes JUnit to junit.xml\n'));
    assert.ok(withStepEnv.files[0].after.includes("\n          NODE_OPTIONS: ${{ env.COVERAGE_LEG == 'true' && '--test-reporter=spec"));
  });

  it('takes the one step a runner it edits runs, when no step collects coverage', () => {
    const { files, read, facts } = fixture('vitest-pnpm');
    const plain = structuredClone(facts);
    plain.workflows[0].tests = plain.workflows[0].tests.filter((run) => !run.coverage);
    const plan = planRepository({ files, read, facts: plain });
    assert.equal(plan.status, 'ready');
    assert.deepEqual(plan.target, { workflow: WORKFLOW, job: 'ci', step: 'Test', runner: 'vitest' });
  });

  it('prefers an ubuntu runner on a matrix axis the step leaves open', () => {
    const { files, read, facts } = fixture('vitest-pnpm');
    const oses = new Map(files);
    oses.set(WORKFLOW, files.get(WORKFLOW).replace('        node-version: [22, 24]\n', '        os: [windows-latest, ubuntu-latest]\n        node-version: [22, 24]\n'));
    const plan = planRepository({ files: oses, read, facts });
    assert.equal(plan.status, 'ready');
    assert.match(plan.files[0].after, /COVERAGE_LEG: \$\{\{ matrix\.node-version == 22 && matrix\.os == 'ubuntu-latest' && \(/);
  });

  it('passes over a Node older than 20 for node --test, which has no JUnit reporter there', () => {
    const { files, read, facts } = fixture('node-test-c8');
    const open = (matrix) => {
      const out = new Map(files);
      out.set(WORKFLOW, files.get(WORKFLOW).replace('        node-version: [20, 22]\n', `        node-version: ${matrix}\n`).replaceAll('        if: matrix.node-version == 22\n', ''));
      return out;
    };
    const plan = planRepository({ files: open('[18, 22]'), read, facts });
    assert.equal(plan.status, 'ready');
    assert.match(plan.files[0].after, /COVERAGE_LEG: \$\{\{ matrix\.node-version == 22 && \(/);
    const old = planRepository({ files: open('[16, 18]'), read, facts });
    assert.equal(old.status, 'hand');
    assert.deepEqual(old.reasons, ['every Node version on the matrix is older than 20, and the node --test JUnit reporter needs 20.11 or later']);
  });

  it('leaves a flow-style paths filter alone when it already takes codecov.yml', () => {
    const { files, read, facts } = fixture('vitest-pnpm');
    const flow = new Map(files);
    const line = '    paths: ["package.json", "src/**", "codecov.yml"]\n';
    flow.set(WORKFLOW, files.get(WORKFLOW).replace('  pull_request:\n    paths:\n      - "package.json"\n      - "src/**"\n', `  pull_request:\n${line}`));
    const plan = planRepository({ files: flow, read, facts });
    assert.deepEqual(plan.reasons, []);
    assert.equal(plan.status, 'ready');
    assert.ok(plan.files[0].after.includes(`  pull_request:\n${line}`));
    assert.ok(plan.changes.includes('ci.yml: codecov.yml joins the push paths filter'), plan.changes.join('\n'));
  });

  it('takes the step a person names', () => {
    const { files, read, facts } = fixture('vitest-pnpm');
    const plan = planRepository({ files, read, facts, step: 'ci.yml:ci:Test' });
    assert.equal(plan.status, 'ready');
    assert.deepEqual(plan.target, { workflow: WORKFLOW, job: 'ci', step: 'Test', runner: 'vitest' });
    assert.match(plan.files[0].after, /run: pnpm test --coverage\.enabled=\$\{\{ env\.COVERAGE_LEG == 'true' \}\} --reporter=default/);
  });

  it('takes the reports a person names where no flag reaches the runner, and leaves the command as it is', () => {
    const { files, read, facts } = fixture('vitest-pnpm');
    const chained = structuredClone(facts);
    chained.workflows[0].tests[1].through = ['pnpm run verify', 'pnpm run test:coverage'];
    const reports = { coverage: ['coverage/lcov.info'], results: ['reports/junit.xml'] };
    const plan = planRepository({ files, read, facts: chained, reports });
    assert.deepEqual(plan.reasons, []);
    assert.equal(plan.status, 'ready');
    // The step's command, exactly as the fixture has it, with nothing added.
    assert.match(plan.files[0].after, /\n {8}run: pnpm test:coverage\n/);
    assert.match(plan.files[0].after, /path: coverage\/lcov\.info\n/);
    assert.match(plan.files[0].after, /path: reports\/junit\.xml\n/);
    assert.ok(plan.changes.includes('ci.yml step "Test with coverage": writes coverage to coverage/lcov.info and test results to reports/junit.xml by its own configuration, as a person named them'), plan.changes.join('\n'));
    assert.deepEqual(checkRecipe(after(files, plan)).problems, []);
  });
});

describe('the plan declines, and says why', () => {
  function declined(change) {
    const { files, read, facts } = fixture('vitest-pnpm');
    const input = { files: new Map(files), read, facts: structuredClone(facts) };
    change(input);
    const plan = planRepository(input);
    assert.equal(plan.status, 'hand');
    assert.deepEqual(plan.files, []);
    return plan.reasons;
  }
  const edit = (input, from, to) => input.files.set(WORKFLOW, input.files.get(WORKFLOW).replace(from, to));

  it('when the runner edit would not reach the runner', () => {
    assert.deepEqual(declined((input) => {
      input.facts.workflows[0].tests[1].through = ['pnpm run verify', 'pnpm run test:coverage'];
    }), ['the step runs Vitest through pnpm run verify, then pnpm run test:coverage; a flag added to the step would not reach Vitest']);
  });

  it('when two steps could carry the reports', () => {
    assert.deepEqual(declined((input) => {
      input.facts.workflows[0].tests.push({ ...input.facts.workflows[0].tests[1], job: 'audit', step: '0' });
    }), ['more than one test step collects coverage: ci.yml job audit step 0, ci.yml job ci step "Test with coverage"; name one with --step workflow:job:step']);
  });

  it('when codecov.yml already says something else', () => {
    assert.deepEqual(declined((input) => input.files.set('codecov.yml', 'coverage:\n  status:\n    project: off\n')), [
      'codecov.yml exists and differs from recipe v2: the project status is not informational; the patch status is not informational; hide_project_coverage is not true',
    ]);
  });

  it('when the job already has a COVERAGE_LEG', () => {
    assert.deepEqual(declined((input) => edit(input, '    timeout-minutes: 20\n', '    timeout-minutes: 20\n    env:\n      COVERAGE_LEG: true\n')), [
      'ci.yml job ci already sets COVERAGE_LEG; finish that edit by hand',
    ]);
  });

  it('when a paths filter is written in flow style', () => {
    assert.deepEqual(declined((input) => edit(input, '  pull_request:\n    paths:\n      - "package.json"\n      - "src/**"\n', '  pull_request:\n    paths: ["package.json", "src/**"]\n')), [
      'ci.yml: the pull_request paths filter is written in flow style; add codecov.yml to it by hand',
    ]);
  });

  it('when the step runs on a condition that is not a matrix leg', () => {
    assert.deepEqual(declined((input) => edit(input, '        if: matrix.node-version == 22\n        env:', "        if: matrix.node-version == 22 && github.event_name == 'push'\n        env:")), [
      "ci.yml step \"Test with coverage\" runs when matrix.node-version == 22 && github.event_name == 'push'; the tool picks a leg only from matrix values",
    ]);
  });

  it('when the step runs on either of two conditions', () => {
    assert.deepEqual(declined((input) => edit(input, '        if: matrix.node-version == 22\n        env:', "        if: matrix.node-version == 22 || github.event_name == 'push'\n        env:")), [
      "ci.yml step \"Test with coverage\" runs when matrix.node-version == 22 || github.event_name == 'push'; the tool picks a leg only from matrix values",
    ]);
  });

  it('when the run text folds its lines', () => {
    assert.deepEqual(declined((input) => edit(input, '        run: pnpm test:coverage\n', '        run: >-\n          pnpm test:coverage\n')), [
      'ci.yml step "Test with coverage": its run text is written as a block folded scalar, which the tool does not edit; add the flags by hand',
    ]);
  });

  it('when another job uploads to Codecov', () => {
    assert.deepEqual(declined((input) => edit(input, '      - run: pnpm audit\n', '      - run: pnpm audit\n      - uses: codecov/codecov-action@v5\n')), [
      'ci.yml job audit uploads to Codecov too; fold it into the new codecov job by hand',
    ]);
  });

  it('when the workflow is not indented two spaces at a time', () => {
    // Four spaces a level, each step's keys four past its dash: valid, and not the tool's style.
    const wide = (text) => text.replace(/^( +)/gm, (spaces) => spaces + spaces).replace(/^( *)- /gm, '$1-   ');
    assert.deepEqual(declined((input) => input.files.set(WORKFLOW, wide(input.files.get(WORKFLOW)))), [
      'ci.yml is not indented two spaces at a time, as the tool writes; edit it by hand',
    ]);
  });
});
