import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reportEdit } from './lib/codecov/runners.mjs';

// A repository's files, for the edit to read.
function repo(files) {
  const texts = new Map(Object.entries(files).map(([path, value]) => [path, typeof value === 'string' ? value : JSON.stringify(value, null, 2)]));
  return (path) => texts.get(path) ?? null;
}

const VITEST_DEPS = { devDependencies: { vitest: '^4.1.0', '@vitest/coverage-v8': '^4.1.0' } };
const JUNIT = '--reporter=default --reporter=junit --outputFile.junit=junit.xml';

describe('the report edit for Vitest', () => {
  it('adds JUnit through pnpm to a script that runs Vitest with coverage, and reads the report from the config', () => {
    const edit = reportEdit({
      runner: 'vitest',
      run: 'pnpm test:coverage',
      through: ['pnpm run test:coverage'],
      coverage: true,
      config: 'vitest.config.ts',
      read: repo({
        'package.json': { scripts: { 'test:coverage': 'vitest run --coverage' }, ...VITEST_DEPS },
        'vitest.config.ts': 'import { defineConfig } from "vitest/config";\nexport default defineConfig({\n  test: {\n    coverage: {\n      provider: "v8",\n      reportsDirectory: "./coverage",\n      reporter: ["text", "json", "json-summary", "html"],\n    },\n  },\n});\n',
      }),
    });
    assert.equal(edit.reason, undefined);
    assert.equal(edit.run, `pnpm test:coverage ${JUNIT}`);
    assert.deepEqual(edit.coverage, ['coverage/coverage-final.json']);
    assert.deepEqual(edit.results, ['junit.xml']);
  });

  it('passes flags through npm after the -- the step already has, and takes Vitest\'s default reporters when the config names none', () => {
    const edit = reportEdit({
      runner: 'vitest',
      run: 'npm test -- --coverage',
      through: ['npm test'],
      coverage: true,
      config: 'vitest.config.ts',
      read: repo({ 'package.json': { scripts: { test: 'vitest run' }, ...VITEST_DEPS }, 'vitest.config.ts': 'export default { test: { environment: "node" } };\n' }),
    });
    assert.equal(edit.run, `npm test -- --coverage ${JUNIT}`);
    assert.deepEqual(edit.coverage, ['coverage/coverage-final.json']);
  });

  it('adds lcov beside reporters Codecov cannot read, to a direct call, with projects in the config', () => {
    const edit = reportEdit({
      runner: 'vitest',
      run: 'pnpm vitest run --coverage',
      coverage: true,
      config: 'vitest.config.ts',
      read: repo({
        'package.json': VITEST_DEPS,
        'vitest.config.ts': 'export default defineConfig({ test: { projects: ["packages/*"], coverage: { provider: "v8", reporter: ["text"] } } });\n',
      }),
    });
    assert.equal(edit.run, `pnpm vitest run --coverage --coverage.reporter=text --coverage.reporter=lcov ${JUNIT}`);
    assert.deepEqual(edit.coverage, ['coverage/lcov.info']);
  });

  it('puts the flags on the one command, before its redirection and pipe', () => {
    const run = 'set -euo pipefail\nnpm run test:coverage 2>&1 | tee test-output.txt\nCLEAN="$(sed -E \'s/x//g\' test-output.txt)"\n';
    const edit = reportEdit({
      runner: 'vitest',
      run,
      through: ['npm run test:coverage'],
      coverage: true,
      read: repo({ 'package.json': { scripts: { 'test:coverage': 'vitest run --coverage' }, ...VITEST_DEPS } }),
    });
    assert.equal(edit.run, `set -euo pipefail\nnpm run test:coverage -- ${JUNIT} 2>&1 | tee test-output.txt\nCLEAN="$(sed -E 's/x//g' test-output.txt)"\n`);
  });

  it('turns coverage on when the step runs none and the provider is installed', () => {
    const edit = reportEdit({
      runner: 'vitest',
      run: 'npm test',
      through: ['npm test'],
      coverage: false,
      read: repo({ 'package.json': { scripts: { test: 'vitest run' }, ...VITEST_DEPS } }),
    });
    // Only on the coverage leg: the other legs run as fast as before.
    assert.equal(edit.run, `npm test -- --coverage.enabled=\${{ env.COVERAGE_LEG == 'true' }} ${JUNIT}`);
    assert.deepEqual(edit.coverage, ['coverage/coverage-final.json']);
  });

  it('keeps the test reporters the command already names', () => {
    const edit = reportEdit({
      runner: 'vitest',
      run: 'npx vitest run --coverage --reporter=verbose',
      coverage: true,
      read: repo({ 'package.json': VITEST_DEPS }),
    });
    assert.equal(edit.run, 'npx vitest run --coverage --reporter=verbose --reporter=junit --outputFile.junit=junit.xml');
  });

  it('keeps the test reporters the config names', () => {
    const edit = reportEdit({
      runner: 'vitest',
      run: 'npx vitest run --coverage',
      coverage: true,
      config: 'vitest.config.mts',
      read: repo({ 'package.json': VITEST_DEPS, 'vitest.config.mts': 'export default { test: { reporters: ["verbose"] } };\n' }),
    });
    assert.equal(edit.run, 'npx vitest run --coverage --reporter=verbose --reporter=junit --outputFile.junit=junit.xml');
  });

  it('places the reports under the directory the step runs in', () => {
    const edit = reportEdit({
      runner: 'vitest',
      run: 'npm test -- --coverage',
      through: ['npm test (web)'],
      dir: 'web',
      coverage: true,
      config: 'web/vitest.config.ts',
      read: repo({ 'web/package.json': { scripts: { test: 'vitest run' }, ...VITEST_DEPS }, 'web/vitest.config.ts': 'export default { test: { coverage: { reportsDirectory: "out/cov", reporter: ["lcov"] } } };\n' }),
    });
    assert.equal(edit.run, `npm test -- --coverage ${JUNIT}`);
    assert.deepEqual(edit.coverage, ['web/out/cov/lcov.info']);
    assert.deepEqual(edit.results, ['web/junit.xml']);
  });

  it('reads Vitest started by path through node, and a manager flag with a value', () => {
    const edit = reportEdit({
      runner: 'vitest',
      run: 'npm --prefix web run test:coverage',
      through: ['npm run test:coverage (web)'],
      dir: 'web',
      coverage: true,
      read: repo({ 'web/package.json': { scripts: { 'test:coverage': 'node --experimental-vm-modules node_modules/vitest/vitest.mjs run --coverage' }, ...VITEST_DEPS } }),
    });
    assert.equal(edit.run, `npm --prefix web run test:coverage -- ${JUNIT}`);
    assert.deepEqual(edit.results, ['web/junit.xml']);
  });

  it('keeps the JUnit file a command or a config already names, and names one where the reporter has none', () => {
    const named = reportEdit({ runner: 'vitest', run: 'npx vitest run --coverage --reporter=junit --outputFile.junit=reports/junit.xml', coverage: true, read: repo({ 'package.json': VITEST_DEPS }) });
    assert.equal(named.run, 'npx vitest run --coverage --reporter=junit --outputFile.junit=reports/junit.xml');
    assert.deepEqual(named.results, ['reports/junit.xml']);
    const unnamed = reportEdit({ runner: 'vitest', run: 'npx vitest run --coverage --reporter=junit', coverage: true, read: repo({ 'package.json': VITEST_DEPS }) });
    assert.equal(unnamed.run, 'npx vitest run --coverage --reporter=junit --outputFile.junit=junit.xml');
    const configured = reportEdit({
      runner: 'vitest',
      run: 'npx vitest run --coverage',
      coverage: true,
      config: 'vitest.config.ts',
      read: repo({ 'package.json': VITEST_DEPS, 'vitest.config.ts': 'export default { test: { reporters: ["default", "junit"], outputFile: { junit: "out/junit.xml" }, coverage: { reporter: [["lcov"]] } } };\n' }),
    });
    assert.equal(configured.run, 'npx vitest run --coverage');
    assert.deepEqual(configured.results, ['out/junit.xml']);
    assert.deepEqual(configured.coverage, ['coverage/lcov.info']);
    const anyFile = reportEdit({
      runner: 'vitest',
      run: 'npx vitest run --coverage',
      coverage: true,
      config: 'vitest.config.ts',
      read: repo({ 'package.json': VITEST_DEPS, 'vitest.config.ts': 'export default { test: { reporters: ["junit"], outputFile: "results.xml" } };\n' }),
    });
    assert.deepEqual(anyFile.results, ['results.xml']);
  });

  it('declines a configuration it cannot read', () => {
    const read = (config) => repo({ 'package.json': VITEST_DEPS, 'vitest.config.ts': config });
    const input = { runner: 'vitest', run: 'npx vitest run --coverage', coverage: true, config: 'vitest.config.ts' };
    assert.equal(reportEdit({ ...input, read: read('export default { test: {\n') }).reason, 'vitest.config.ts could not be read as JavaScript or TypeScript');
    assert.equal(reportEdit({ ...input, read: read('export default { test: { outputFile: process.env.OUT } };\n') }).reason, 'vitest.config.ts sets test.outputFile from an expression; the tool reads only literal values');
    assert.equal(reportEdit({ ...input, read: read('export default { test: { coverage: { reporter: [["json", { file: "x.json" }]] } } };\n') }).reason, 'vitest.config.ts sets coverage.reporter from an expression; the tool reads only literal values');
  });

  it('declines what it cannot edit safely, and says why', () => {
    const chain = reportEdit({
      runner: 'vitest',
      run: 'npm run verify',
      through: ['npm run verify', 'npm run test:coverage'],
      coverage: true,
      read: repo({ 'package.json': { scripts: { verify: 'npm run typecheck && npm run test:coverage', 'test:coverage': 'vitest run --coverage' }, ...VITEST_DEPS } }),
    });
    assert.equal(chain.reason, 'the step runs Vitest through npm run verify, then npm run test:coverage; a flag added to the step would not reach Vitest');
    const joined = reportEdit({
      runner: 'vitest',
      run: 'npm test',
      through: ['npm test'],
      coverage: true,
      read: repo({ 'package.json': { scripts: { test: 'vitest run --coverage && node scripts/after.js' }, ...VITEST_DEPS } }),
    });
    assert.equal(joined.reason, 'the script test runs more than Vitest (vitest run --coverage && node scripts/after.js); a flag added to the step would reach its last command');
    const noProvider = reportEdit({
      runner: 'vitest',
      run: 'npm test',
      through: ['npm test'],
      coverage: false,
      read: repo({ 'package.json': { scripts: { test: 'vitest run' }, devDependencies: { vitest: '^4.1.0' } } }),
    });
    assert.equal(noProvider.reason, 'Vitest collects no coverage here and @vitest/coverage-v8 is not a dependency; add it at the version of vitest');
    const computed = reportEdit({
      runner: 'vitest',
      run: 'npx vitest run --coverage',
      coverage: true,
      config: 'vitest.config.ts',
      read: repo({ 'package.json': VITEST_DEPS, 'vitest.config.ts': 'export default { test: { coverage: { reporter: process.env.CI ? ["lcov"] : ["text"] } } };\n' }),
    });
    assert.equal(computed.reason, 'vitest.config.ts sets coverage.reporter from an expression; the tool reads only literal values');
  });
});

describe('the report edit for pytest', () => {
  const PYPROJECT = '[project]\nname = "audiobooker"\n[project.optional-dependencies]\ndev = ["pytest>=8", "pytest-cov>=5.0"]\n';

  it('adds JUnit at the end of a command continued across lines', () => {
    const run = 'pytest tests/ -v --tb=short \\\n  --cov=audiobooker --cov-report=xml --cov-report=term-missing\n';
    const edit = reportEdit({ runner: 'pytest', run, coverage: true, config: 'pyproject.toml', read: repo({ 'pyproject.toml': PYPROJECT }) });
    assert.equal(edit.run, 'pytest tests/ -v --tb=short \\\n  --cov=audiobooker --cov-report=xml --cov-report=term-missing --junitxml=junit.xml\n');
    assert.deepEqual(edit.coverage, ['coverage.xml']);
    assert.deepEqual(edit.results, ['junit.xml']);
  });

  it('adds an XML report beside the terminal one, reading addopts', () => {
    const edit = reportEdit({
      runner: 'pytest',
      run: 'pytest tests/ -v --tb=short --cov=mcp_stress_test --cov-report=term-missing',
      coverage: true,
      config: 'pyproject.toml',
      read: repo({ 'pyproject.toml': `${PYPROJECT}[tool.pytest.ini_options]\naddopts = "-v --cov=mcp_stress_test --cov-report=term-missing"\n` }),
    });
    assert.equal(edit.run, 'pytest tests/ -v --tb=short --cov=mcp_stress_test --cov-report=term-missing --cov-report=xml --junitxml=junit.xml');
  });

  it('turns coverage on for the project\'s package when pytest-cov is a dependency, keeping the JUnit file the step writes', () => {
    const edit = reportEdit({
      runner: 'pytest',
      run: 'pytest tests/ -x -q -rs --tb=short -o junit_family=xunit2 --junitxml=junit.xml',
      coverage: false,
      config: 'pyproject.toml',
      read: repo({ 'pyproject.toml': '[project]\nname = "portlight"\n[project.optional-dependencies]\ndev = ["pytest-cov>=5.0"]\n', 'src/portlight/__init__.py': '' }),
    });
    assert.equal(edit.run, "pytest tests/ -x -q -rs --tb=short -o junit_family=xunit2 --junitxml=junit.xml ${{ env.COVERAGE_LEG == 'true' && '--cov=portlight --cov-report=term --cov-report=xml' || '' }}");
    assert.deepEqual(edit.coverage, ['coverage.xml']);
    assert.deepEqual(edit.results, ['junit.xml']);
  });

  it('measures the source coverage.py is configured with', () => {
    const edit = reportEdit({
      runner: 'pytest',
      run: 'python -m pytest',
      coverage: false,
      config: 'pyproject.toml',
      read: repo({ 'pyproject.toml': '[project]\nname = "x"\ndependencies = []\n[dependency-groups]\ndev = ["pytest-cov"]\n[tool.coverage.run]\nsource = ["pkg"]\n[tool.coverage.xml]\noutput = "reports/cov.xml"\n' }),
    });
    assert.equal(edit.run, "python -m pytest ${{ env.COVERAGE_LEG == 'true' && '--cov --cov-report=term --cov-report=xml' || '' }} --junitxml=junit.xml");
    assert.deepEqual(edit.coverage, ['reports/cov.xml']);
  });

  it('adds to the pytest command inside a longer script', () => {
    const run = 'set -euo pipefail\nPARALLEL_FLAGS=""\nif [ "${P}" = "1" ]; then\n  PARALLEL_FLAGS="-n auto"\nfi\npytest tests/ --cov=backpropagate --cov-report=xml --cov-fail-under="${COV_FLOOR}" ${PARALLEL_FLAGS} -m "not gpu and not slow"\n';
    const edit = reportEdit({ runner: 'pytest', run, coverage: true, read: repo({ 'pyproject.toml': PYPROJECT }) });
    assert.equal(edit.run, run.replace('-m "not gpu and not slow"', '-m "not gpu and not slow" --junitxml=junit.xml'));
  });

  it('finds pytest under uv run and poetry run', () => {
    const uv = reportEdit({ runner: 'pytest', run: 'uv run --group dev pytest tests/ --cov=pkg --cov-report=xml', coverage: true, read: repo({ 'pyproject.toml': PYPROJECT }) });
    assert.equal(uv.run, 'uv run --group dev pytest tests/ --cov=pkg --cov-report=xml --junitxml=junit.xml');
    const poetry = reportEdit({ runner: 'pytest', run: 'poetry run python -m pytest --cov=pkg --cov-report=xml:out/cov.xml', coverage: true, read: repo({ 'pyproject.toml': PYPROJECT }) });
    assert.equal(poetry.run, 'poetry run python -m pytest --cov=pkg --cov-report=xml:out/cov.xml --junitxml=junit.xml');
    assert.deepEqual(poetry.coverage, ['out/cov.xml']);
  });

  it('reads addopts from pytest.ini and setup.cfg, and coverage settings from .coveragerc', () => {
    const ini = reportEdit({
      runner: 'pytest',
      run: 'pytest',
      coverage: true,
      read: repo({ 'pytest.ini': '[pytest]\n; the suite\naddopts = -q\n  --cov=pkg\n  --junitxml=reports/junit.xml\n', 'pyproject.toml': PYPROJECT }),
    });
    assert.equal(ini.run, 'pytest --cov-report=term --cov-report=xml');
    assert.deepEqual(ini.results, ['reports/junit.xml']);
    const cfg = reportEdit({
      runner: 'pytest',
      run: 'pytest',
      coverage: false,
      read: repo({ 'setup.cfg': '[metadata]\nname = pkg\n[tool:pytest]\naddopts = --strict-markers\n[options.extras_require]\ndev = pytest-cov\n', '.coveragerc': '[run]\nsource = pkg\n[xml]\noutput = cov.xml\n' }),
    });
    assert.equal(cfg.run, "pytest ${{ env.COVERAGE_LEG == 'true' && '--cov --cov-report=term --cov-report=xml' || '' }} --junitxml=junit.xml");
    assert.deepEqual(cfg.coverage, ['cov.xml']);
  });

  it('declines what it cannot edit safely, and says why', () => {
    assert.equal(
      reportEdit({ runner: 'pytest', run: 'coverage run -m pytest tests/', coverage: true, read: repo({ 'pyproject.toml': PYPROJECT }) }).reason,
      'the step runs pytest under coverage run; add coverage xml after it by hand',
    );
    assert.equal(
      reportEdit({ runner: 'pytest', run: 'pytest --junitxml=junit-${{ matrix.os }}.xml', coverage: true, read: repo({ 'pyproject.toml': PYPROJECT }) }).reason,
      "the JUnit file's name (junit-${{ matrix.os }}.xml) is made at run time",
    );
    assert.equal(
      reportEdit({ runner: 'pytest', run: 'pytest tests/', coverage: false, read: repo({ 'pyproject.toml': '[project]\nname = "x"\n' }) }).reason,
      'pytest collects no coverage here and pytest-cov is not a dependency',
    );
    assert.equal(
      reportEdit({ runner: 'pytest', run: 'python verify.py --installed', through: ['verify.py'], coverage: false, read: repo({ 'pyproject.toml': PYPROJECT }) }).reason,
      'the step runs pytest through verify.py; a flag added to the step would not reach pytest',
    );
    assert.equal(
      reportEdit({ runner: 'pytest', run: 'pytest tests/unit\npytest tests/int', coverage: true, read: repo({ 'pyproject.toml': PYPROJECT }) }).reason,
      'the step runs pytest 2 times; name the one to report',
    );
    assert.equal(
      reportEdit({ runner: 'pytest', run: 'pytest tests/', coverage: false, read: repo({ 'pyproject.toml': '[project]\nname = "x"\ndependencies = ["pytest-cov"]\n' }) }).reason,
      'pytest-cov is a dependency but no package to measure was found: no [tool.coverage.run] source, and x is not a package at the root or under src/',
    );
  });
});

describe('the report edit for node --test', () => {
  const NODE_OPTIONS = "${{ env.COVERAGE_LEG == 'true' && '--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=junit.xml' || '' }}";

  it('writes JUnit through NODE_OPTIONS and reads c8\'s lcov from package.json', () => {
    const edit = reportEdit({
      runner: 'node --test',
      run: 'npm run coverage',
      through: ['npm run coverage', 'npm test'],
      coverage: true,
      read: repo({ 'package.json': { scripts: { coverage: 'c8 npm test', test: 'node --test tests/**/*.test.js' }, c8: { reporter: ['text', 'lcov'], 'report-dir': 'coverage' } } }),
    });
    assert.equal(edit.run, undefined);
    assert.deepEqual(edit.env, { NODE_OPTIONS });
    assert.deepEqual(edit.after, []);
    assert.deepEqual(edit.coverage, ['coverage/lcov.info']);
    assert.deepEqual(edit.results, ['junit.xml']);
  });

  it('asks c8 for lcov after the run when its reporters leave it out', () => {
    const edit = reportEdit({
      runner: 'node --test',
      run: 'npm run coverage',
      through: ['npm run coverage', 'npm test'],
      coverage: true,
      read: repo({ 'package.json': { scripts: { coverage: 'c8 --include=lib/** npm test', test: 'node --test' } }, '.c8rc.json': '{ "reports-dir": "out" }' }),
    });
    assert.deepEqual(edit.after, [{ name: 'Coverage report for Codecov', run: 'npx c8 report --include=lib/** --reporter=lcov', dir: '' }]);
    assert.deepEqual(edit.coverage, ['out/lcov.info']);
  });

  it('collects V8 coverage for a run that has none, and finds each workspace\'s JUnit file', () => {
    const edit = reportEdit({
      runner: 'node --test',
      run: 'npm test',
      through: ['npm test', 'npm test (packages/kernel)'],
      dirs: ['packages/kernel', 'packages/cli'],
      coverage: false,
      read: repo({ 'package.json': { scripts: { test: 'npm run test -w packages/kernel && npm run test -w packages/cli' } }, 'packages/kernel/package.json': { scripts: { test: 'node --test test/' } } }),
    });
    assert.deepEqual(edit.env, { NODE_OPTIONS, NODE_V8_COVERAGE: "${{ env.COVERAGE_LEG == 'true' && format('{0}/v8-coverage', runner.temp) || '' }}" });
    assert.deepEqual(edit.after, [{ name: 'Coverage report for Codecov', run: 'npx --yes c8@12.0.0 report --temp-directory "$RUNNER_TEMP/v8-coverage" --reporter=lcov --reporter=text-summary --report-dir coverage/c8', dir: '' }]);
    assert.deepEqual(edit.coverage, ['coverage/c8/lcov.info']);
    assert.deepEqual(edit.results, ['packages/cli/junit.xml', 'packages/kernel/junit.xml']);
  });

  it('reads c8 run through npx, its flags spelled apart from their values', () => {
    const edit = reportEdit({
      runner: 'node --test',
      run: 'npx --yes c8 --reporter lcov --reports-dir out -x "test/**" node --test',
      coverage: true,
      read: repo({ 'package.json': {} }),
    });
    assert.deepEqual(edit.after, []);
    assert.deepEqual(edit.coverage, ['out/lcov.info']);
  });

  it('declines what it cannot edit safely, and says why', () => {
    const base = { runner: 'node --test', run: 'npm test', through: ['npm test'], coverage: false };
    assert.equal(
      reportEdit({ ...base, through: ['scripts/test.sh'], run: 'bash scripts/test.sh', read: repo({ 'scripts/test.sh': 'node --test --test-reporter=tap test/\n' }) }).reason,
      'the scripts/test.sh names its own --test-reporter; a reporter added through NODE_OPTIONS would not pair with its destinations',
    );
    assert.equal(
      reportEdit({ ...base, coverage: true, read: repo({ 'package.json': { scripts: { test: 'node --test --experimental-test-coverage' } } }) }).reason,
      "the run measures coverage with node's own --experimental-test-coverage; add its lcov reporter by hand",
    );
    assert.equal(
      reportEdit({ ...base, coverage: true, read: repo({ 'package.json': { scripts: { test: 'nyc node --test' } } }) }).reason,
      'the run collects coverage with a tool other than c8; add its lcov report by hand',
    );
    assert.equal(
      reportEdit({ ...base, run: 'c8 --per-file --watermarks npm test', coverage: true, read: repo({ 'package.json': { scripts: { test: 'node --test' } } }) }).reason,
      'c8 runs with --watermarks, which the tool does not know how to repeat in a later report',
    );
    assert.match(
      reportEdit({ ...base, run: 'node --test dist/', through: [], read: repo({ 'tsconfig.json': '{ not json' }) }).reason,
      /built without source maps/,
    );
    assert.equal(
      reportEdit({ ...base, env: new Set(['NODE_OPTIONS']), read: repo({ 'package.json': { scripts: { test: 'node --test' } } }) }).reason,
      'the step already sets NODE_OPTIONS, which the JUnit reporter would be added to',
    );
    assert.equal(
      reportEdit({ ...base, read: repo({ 'package.json': { scripts: { test: 'node --test --test-reporter=tap' } } }) }).reason,
      'the script test names its own --test-reporter; a reporter added through NODE_OPTIONS would not pair with its destinations',
    );
    assert.equal(
      reportEdit({ ...base, run: 'npm run verify', through: ['npm run verify'], read: repo({ 'package.json': { scripts: { verify: 'tsc && node --test dist/tests/*.test.js' } }, 'tsconfig.json': '{ "compilerOptions": { "outDir": "dist" } }' }) }).reason,
      'the tests run from dist/, built without source maps, so coverage would name built files; turn on sourceMap in tsconfig.json',
    );
    assert.equal(
      reportEdit({ ...base, run: 'npm run verify', through: ['npm run verify'], read: repo({ 'package.json': { scripts: { verify: 'tsc && node --test dist/tests/*.test.js' } }, 'tsconfig.json': '{\n  // built for tests\n  "compilerOptions": { "sourceMap": true }\n}' }) }).reason,
      undefined,
    );
    // A setting the configuration extends counts, and its own setting wins.
    const extended = (own) => repo({ 'package.json': { scripts: { verify: 'tsc && node --test dist/tests/*.test.js' } }, 'tsconfig.json': JSON.stringify({ extends: './configs/base', compilerOptions: own }), 'configs/base.json': '{ "compilerOptions": { "sourceMap": true } }' });
    assert.equal(reportEdit({ ...base, run: 'npm run verify', through: ['npm run verify'], read: extended({ outDir: 'dist' }) }).reason, undefined);
    assert.match(reportEdit({ ...base, run: 'npm run verify', through: ['npm run verify'], read: extended({ sourceMap: false }) }).reason, /built without source maps/);
  });
});

describe('the report edit for other runners', () => {
  it('declines a runner it does not edit', () => {
    assert.equal(
      reportEdit({ runner: 'mocha', run: 'npm test', through: ['npm test'], coverage: false, read: repo({}) }).reason,
      'the tool adds reports to Vitest, pytest and node --test runs; this step runs mocha',
    );
    assert.equal(
      reportEdit({ runner: 'node', run: 'npm test', through: ['npm test'], coverage: true, read: repo({}) }).reason,
      'the tests run as plain node scripts, which write no test results to upload',
    );
  });
});
