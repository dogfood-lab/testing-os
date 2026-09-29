import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { main } from './codecov-rollout.mjs';
import { BRANCH, CODECOV_YML, TITLE } from './lib/codecov/recipe.mjs';

const FIXTURES = resolve(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/codecov');
const WORKFLOW = '.github/workflows/ci.yml';
const made = [];
after(() => {
  for (const root of made) rmSync(root, { recursive: true, force: true });
});

// A git repository holding a fixture, committed on main.
function repository(name, change = (text) => text) {
  const root = mkdtempSync(join(tmpdir(), 'codecov-rollout-'));
  made.push(root);
  cpSync(join(FIXTURES, name, 'repo'), root, { recursive: true });
  writeFileSync(join(root, WORKFLOW), change(readFileSync(join(root, WORKFLOW), 'utf8')));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  for (const [key, value] of [['user.email', 'codecov-rollout'], ['user.name', 'codecov'], ['maintenance.auto', 'false'], ['gc.auto', '0']]) git('config', key, value);
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
  return { root, git };
}

async function run(argv, options = {}) {
  let out = '';
  const code = await main(argv, { write: (text) => (out += text), ...options });
  return { code, out };
}

describe('codecov-rollout check', () => {
  it('lists how a repository differs, and passes one on recipe v2', async () => {
    const { root } = repository('vitest-pnpm');
    const before = await run(['check', root]);
    assert.equal(before.code, 1);
    assert.match(before.out, /: 11 differences\n/);
    assert.match(before.out, /\n {3}- no codecov\.yml\n/);
    const moved = repository('vitest-pnpm', () => readFileSync(join(FIXTURES, 'vitest-pnpm', 'expected', WORKFLOW), 'utf8'));
    writeFileSync(join(moved.root, 'codecov.yml'), CODECOV_YML);
    const now = await run(['check', moved.root]);
    assert.equal(now.code, 0);
    assert.match(now.out, /: matches recipe v2\n/);
  });
});

describe('codecov-rollout plan', () => {
  it('says so when a repository is already on recipe v2', async () => {
    const moved = repository('vitest-pnpm', () => readFileSync(join(FIXTURES, 'vitest-pnpm', 'expected', WORKFLOW), 'utf8'));
    writeFileSync(join(moved.root, 'codecov.yml'), CODECOV_YML);
    const { code, out } = await run(['plan', moved.root]);
    assert.equal(code, 0);
    assert.match(out, /: already on recipe v2\n$/);
  });

  it('shows the change as a diff and writes nothing', async () => {
    const { root, git } = repository('vitest-pnpm');
    const { code, out } = await run(['plan', root]);
    assert.equal(code, 0);
    assert.match(out, /: ready: ci\.yml job ci, step "Test with coverage" \(vitest\)\n/);
    assert.match(out, /\n {3}- ci\.yml: a codecov job uploads both with OIDC, running none of the repository's code\n/);
    assert.match(out, /\n--- a\/\.github\/workflows\/ci\.yml\n\+\+\+ b\/\.github\/workflows\/ci\.yml\n/);
    assert.match(out, /\n\+ {2}codecov:\n/);
    assert.match(out, /\n--- \/dev\/null\n\+\+\+ b\/codecov\.yml\n/);
    assert.equal(git('status', '--porcelain'), '');
  });

  it('says what a person must decide, and fails', async () => {
    const { root } = repository('vitest-pnpm');
    writeFileSync(join(root, 'package.json'), readFileSync(join(root, 'package.json'), 'utf8').replace('"test:coverage": "vitest run --coverage"', '"test:coverage": "vitest run --coverage && node check.js"'));
    const { code, out } = await run(['plan', root]);
    assert.equal(code, 1);
    assert.match(out, /: needs a person\n {3}! the script test:coverage runs more than Vitest/);
  });

  it('prints each plan as JSON', async () => {
    const { root } = repository('pytest-matrix');
    const { code, out } = await run(['plan', '--json', root]);
    assert.equal(code, 0);
    const [plan] = JSON.parse(out);
    assert.equal(plan.status, 'ready');
    assert.equal(plan.repository, root);
    assert.deepEqual(plan.target, { workflow: WORKFLOW, job: 'test', step: 'Run tests with coverage', runner: 'pytest' });
    assert.equal(plan.files[0].after, readFileSync(join(FIXTURES, 'pytest-matrix', 'expected', WORKFLOW), 'utf8'));
  });

  it('takes the test step a person names', async () => {
    const { root } = repository('vitest-pnpm');
    const { code, out } = await run(['plan', '--step', 'ci.yml:ci:Test', root]);
    assert.equal(code, 0);
    assert.match(out, /: ready: ci\.yml job ci, step "Test" \(vitest\)\n/);
  });

  it('takes the reports a person names, and leaves the step as it is', async () => {
    const { root } = repository('vitest-pnpm');
    const { code, out } = await run(['plan', '--coverage', 'coverage/lcov.info', '--results', 'junit.xml', root]);
    assert.equal(code, 0);
    assert.match(out, /writes coverage to coverage\/lcov\.info and test results to junit\.xml by its own configuration, as a person named them\n/);
    assert.doesNotMatch(out, /--reporter=junit/);
  });
});

describe('codecov-rollout apply', () => {
  it('commits the change on its own branch, and says how to push it', async () => {
    const { root, git } = repository('vitest-pnpm');
    const { code, out } = await run(['apply', root]);
    assert.equal(code, 0);
    assert.equal(git('branch', '--show-current'), BRANCH);
    assert.equal(git('log', '-1', '--format=%s'), TITLE);
    assert.match(git('log', '-1', '--format=%b'), /^Moves CI to Codecov recipe v2:\n- ci\.yml job ci: COVERAGE_LEG is true/);
    assert.equal(git('status', '--porcelain'), '');
    assert.equal(readFileSync(join(root, WORKFLOW), 'utf8'), readFileSync(join(FIXTURES, 'vitest-pnpm', 'expected', WORKFLOW), 'utf8'));
    assert.equal(readFileSync(join(root, 'codecov.yml'), 'utf8'), CODECOV_YML);
    assert.match(out, /\n {3}git -C \S+ push -u origin ci\/codecov\n/);
    const again = await run(['check', root]);
    assert.equal(again.code, 0);
  });

  it('adds the trailers it is given to the commit message', async () => {
    const { root, git } = repository('pytest-matrix');
    const { code } = await run(['apply', '--trailer', 'Refs: fleet-rollout', '--trailer', 'Checked-by: codecov-rollout', root]);
    assert.equal(code, 0);
    assert.match(git('log', '-1', '--format=%B'), /\n\nRefs: fleet-rollout\nChecked-by: codecov-rollout$/);
  });

  it('leaves alone what is not a git checkout, and a branch that already exists', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'codecov-rollout-'));
    made.push(plain);
    const outside = await run(['apply', plain]);
    assert.equal(outside.code, 1);
    assert.match(outside.out, /: not applied: not a git checkout\n/);
    const { root, git } = repository('vitest-pnpm');
    git('branch', BRANCH);
    const taken = await run(['apply', root]);
    assert.equal(taken.code, 1);
    assert.match(taken.out, /\n {3}not applied: could not make branch ci\/codecov \(/);
    assert.equal(git('branch', '--show-current'), 'main');
  });

  it('commits nothing when the pinned Atlas can neither check nor map', async () => {
    const { root, git } = repository('vitest-pnpm', (text) => text.replace('      - run: pnpm install --frozen-lockfile\n', '      - run: pnpm install --frozen-lockfile\n\n      - run: npx --yes @dogfood-lab/atlas@1.17.0 check\n'));
    const { code, out } = await run(['apply', root], { exec: () => ({ status: 1, output: 'atlas: boundary file invalid\n' }) });
    assert.equal(code, 1);
    assert.match(out, /not committed: @dogfood-lab\/atlas@1\.17\.0 check failed and map failed too; the change is staged on ci\/codecov\natlas: boundary file invalid\n/);
    assert.equal(git('log', '-1', '--format=%s'), 'fixture');
  });

  it('leaves a repository with uncommitted changes alone', async () => {
    const { root, git } = repository('vitest-pnpm');
    writeFileSync(join(root, 'stray.txt'), 'work in progress\n');
    const { code, out } = await run(['apply', root]);
    assert.equal(code, 1);
    assert.match(out, /: not applied: the working tree has uncommitted changes\n/);
    assert.equal(git('branch', '--show-current'), 'main');
  });

  it('leaves a repository that needs a person alone', async () => {
    const { root, git } = repository('vitest-pnpm');
    writeFileSync(join(root, 'codecov.yml'), 'coverage:\n  status:\n    project: off\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'strict');
    const { code, out } = await run(['apply', root]);
    assert.equal(code, 1);
    assert.match(out, /: needs a person\n {3}! codecov\.yml exists and differs from recipe v2/);
    assert.equal(git('branch', '--show-current'), 'main');
  });

  it('runs the Atlas check the workflow pins, and maps again when it fails', async () => {
    const { root, git } = repository('vitest-pnpm', (text) => text.replace('      - run: pnpm install --frozen-lockfile\n', '      - run: pnpm install --frozen-lockfile\n\n      - run: npx --yes @dogfood-lab/atlas@1.17.0 check\n'));
    const calls = [];
    const fake = (command, args, cwd) => {
      calls.push([command, ...args]);
      if (args.at(-1) === 'map') writeFileSync(join(cwd, 'atlas', 'structure.json'), '{}\n');
      return { status: args.at(-1) === 'check' ? 1 : 0, output: '' };
    };
    const { code } = await run(['apply', root], { exec: fake });
    assert.equal(code, 0);
    assert.deepEqual(calls, [['npx', '--yes', '@dogfood-lab/atlas@1.17.0', 'check'], ['npx', '--yes', '@dogfood-lab/atlas@1.17.0', 'map']]);
    assert.match(git('show', '--stat', '--format=', 'HEAD'), /atlas\/structure\.json/);
  });
});

describe('codecov-rollout delivered', () => {
  function answers(byRepo) {
    return async (url) => {
      const name = /\/repos\/([^/]+)\/$/.exec(url)[1];
      const body = byRepo[name];
      return body == null ? { status: 404, json: async () => ({ detail: 'Not found.' }) } : { status: 200, json: async () => body };
    };
  }

  it('says whether coverage reached Codecov, on the branch GitHub calls default', async () => {
    const checkout = repository('vitest-pnpm');
    checkout.git('remote', 'add', 'origin', 'https://github.com/mcp-tool-shop-org/example.git');
    checkout.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    checkout.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    const fetch = answers({
      example: { name: 'example', branch: 'main', active: true, totals: { coverage: 87.5 } },
      stale: { name: 'stale', branch: 'master', active: true, totals: { coverage: 40 } },
      empty: { name: 'empty', branch: 'main', active: true, totals: null },
    });
    const { code, out } = await run(['delivered', checkout.root, 'mcp-tool-shop-org/stale', 'mcp-tool-shop-org/empty', 'mcp-tool-shop-org/missing'], { fetch });
    assert.equal(code, 1);
    assert.equal(out, [
      '== mcp-tool-shop-org/example: delivered, 87.5% on main',
      '== mcp-tool-shop-org/stale: Codecov reads master; if GitHub\'s default branch is not master, set it in the repository\'s Codecov settings (40% on master)',
      '== mcp-tool-shop-org/empty: on Codecov, and no coverage on main yet',
      '== mcp-tool-shop-org/missing: not on Codecov yet; it appears after the first upload',
      '',
    ].join('\n'));
  });

  it('names a branch Codecov reads that is not GitHub\'s default', async () => {
    const checkout = repository('vitest-pnpm');
    checkout.git('remote', 'add', 'origin', 'git@github.com:mcp-tool-shop-org/example.git');
    checkout.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    checkout.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    const { code, out } = await run(['delivered', checkout.root], { fetch: answers({ example: { name: 'example', branch: 'master', active: true, totals: { coverage: 12 } } }) });
    assert.equal(code, 1);
    assert.equal(out, "== mcp-tool-shop-org/example: Codecov reads master, and GitHub's default branch is main; set main in the repository's Codecov settings\n");
  });
});

describe('codecov-rollout delivered, when it cannot tell', () => {
  it('names a target it cannot read, and an answer it did not expect', async () => {
    const fetch = async (url) => {
      if (url.includes('/unreachable/')) throw new Error('getaddrinfo ENOTFOUND api.codecov.io');
      if (url.includes('/broken/')) return { status: 500, json: async () => ({}) };
      return { status: 200, json: async () => ({ name: 'idle', branch: 'main', active: false, totals: null }) };
    };
    const { code, out } = await run(['delivered', 'not a repository', 'mcp-tool-shop-org/unreachable', 'mcp-tool-shop-org/broken', 'mcp-tool-shop-org/idle'], { fetch });
    assert.equal(code, 1);
    assert.equal(out, [
      '== not a repository: not a checkout with a GitHub origin, nor owner/name',
      '== mcp-tool-shop-org/unreachable: could not reach api.codecov.io (getaddrinfo ENOTFOUND api.codecov.io)',
      '== mcp-tool-shop-org/broken: Codecov answered 500',
      "== mcp-tool-shop-org/idle: on Codecov but not active; activate it in the repository's Codecov settings",
      '',
    ].join('\n'));
  });
});

describe('codecov-rollout usage', () => {
  it('runs as a program, and exits 2 with its usage when called wrong', () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./codecov-rollout.mjs', import.meta.url)), 'plan'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stdout, /^codecov-rollout: plan needs at least one repository\nusage: /);
  });

  it('explains itself when it is called wrong', async () => {
    for (const argv of [[], ['unknown', '.'], ['plan'], ['plan', '--step'], ['plan', '--coverage', 'lcov.info', '.'], ['plan', '--results', 'junit.xml', '.']]) {
      const { code, out } = await run(argv);
      assert.equal(code, 2);
      assert.match(out, /^usage: node scripts\/codecov-rollout\.mjs <check\|plan\|apply\|delivered>/m);
    }
  });
});
