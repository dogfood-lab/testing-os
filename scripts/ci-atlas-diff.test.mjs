/**
 * Pins for the "Atlas diff on this pull request" step in
 * .github/workflows/ci.yml, which posts the structural delta of a pull
 * request as one comment on it and updates that comment in place.
 *
 * Two halves. The text half pins the step's contract where a YAML reading
 * would add nothing: pull_request only, one Node leg, the hidden marker, the
 * base fetch that respects a shallow checkout, the widened token scoped to
 * this job, no third-party action, and no `${{ }}` interpolated into the
 * script. The behavioral half runs the step's own script under bash with
 * `git`, `node` and `gh` stubbed on PATH, because PATCH-or-POST, the fork
 * branch and "never fails the build" are shell control flow that a text
 * match cannot tell right from subtly wrong. The comment itself can only be
 * proven by the first real pull request run.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ciPath = resolve(here, '..', '.github/workflows/ci.yml');
const MARKER = '<!-- atlas-diff -->';
const STEP_NAME = 'Atlas diff on this pull request';

function ciText() {
  return readFileSync(ciPath, 'utf8');
}

function buildJob(text) {
  const start = text.indexOf('\n  build-and-test:');
  const end = text.indexOf('\n  windows-step-fixtures-proof-of-life:');
  assert.ok(start > 0 && end > start, 'expected build-and-test before the windows proof-of-life job');
  return text.slice(start, end);
}

// The step from its `- name:` line to the next step at the same indentation.
function stepBlock(text) {
  const start = text.indexOf(`      - name: ${STEP_NAME}\n`);
  assert.ok(start > 0, `expected a step named "${STEP_NAME}" in ci.yml`);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n {6}- /);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

// The `run: |` body, dedented to the script bash receives.
function stepScript(text) {
  const lines = stepBlock(text).split('\n');
  const at = lines.findIndex((line) => /^ {8}run: \|\s*$/.test(line));
  assert.ok(at >= 0, 'the step runs a literal block script');
  const body = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() !== '' && !line.startsWith(' '.repeat(10))) break;
    body.push(line.slice(10));
  }
  return `${body.join('\n').trimEnd()}\n`;
}

test('the step exists in build-and-test, after the atlas check and before the script tests', () => {
  const job = buildJob(ciText());
  const check = job.indexOf('- run: node packages/atlas/cli.js check\n');
  const step = job.indexOf(`- name: ${STEP_NAME}\n`);
  const scripts = job.indexOf('- run: npm run test:scripts\n');
  assert.ok(check > 0, 'the atlas check step is still there');
  assert.ok(step > check, 'the diff runs after atlas check');
  assert.ok(scripts > step, 'and before test:scripts');
});

test('the step runs on pull_request only, on the Node 22 leg only', () => {
  const block = stepBlock(ciText());
  assert.match(block, /^ {8}if: \$\{\{ github\.event_name == 'pull_request' && matrix\.node-version == 22 \}\}$/m);
});

test('the step fetches the base branch, shallow when the checkout is shallow, and diffs against it', () => {
  const block = stepBlock(ciText());
  assert.match(block, /BASE_REF: \$\{\{ github\.base_ref \}\}/);
  assert.match(block, /git rev-parse --is-shallow-repository\)" = "true" \]; then depth=\(--depth=1\)/);
  assert.match(block, /git fetch --no-tags "\$\{depth\[@\]\}" origin "\+refs\/heads\/\$\{BASE_REF\}:refs\/remotes\/origin\/\$\{BASE_REF\}"/);
  assert.match(block, /node packages\/atlas\/cli\.js diff --base "origin\/\$\{BASE_REF\}" > "\$delta"/);
});

test('the step tags its comment with the marker and finds only its own comment by it', () => {
  const block = stepBlock(ciText());
  assert.ok(block.includes(`marker='${MARKER}'`), 'the marker string is defined once in the script');
  assert.match(block, /printf '%s\\n' "\$marker"; cat "\$delta"; \} > "\$body"/, 'the marker heads the comment body');
  assert.match(block, /select\(\.user\.login == \\"github-actions\[bot\]\\" and \(\.body \| contains\(\\"\$\{marker\}\\"\)\)\)/,
    'a person quoting the marker is never edited: the comment must be the workflow bot\'s own');
});

test('the step updates the comment it finds and posts a new one only when there is none', () => {
  const block = stepBlock(ciText());
  assert.match(block, /if \[ -n "\$id" \]; then\n\s+gh api --method PATCH "repos\/\$\{REPO\}\/issues\/comments\/\$\{id\}"[\s\S]*?\n\s+else\n\s+gh api --method POST "repos\/\$\{REPO\}\/issues\/\$\{PR_NUMBER\}\/comments"/);
});

test('the step never fails the build: no exit other than exit 0, and both writes fall back to a warning', () => {
  const block = stepBlock(ciText());
  assert.doesNotMatch(block, /\bexit [1-9]/, 'no non-zero exit anywhere in the step');
  assert.match(stepScript(ciText()), /\nexit 0\n$/, 'the script ends in exit 0');
  const writes = block.match(/gh api --method (PATCH|POST)[^\n]*\\\n[^\n]*/g) ?? [];
  assert.equal(writes.length, 2);
  for (const write of writes) assert.match(write, /\|\| echo "::warning::/);
});

test('the step uses gh with the workflow token, no third-party action, and no expression inside the script', () => {
  const block = stepBlock(ciText());
  assert.doesNotMatch(block, /^\s+uses:/m);
  assert.match(block, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(block, /secrets\./);
  assert.doesNotMatch(stepScript(ciText()), /\$\{\{/, 'untrusted values reach the script through env, never interpolated into it');
});

test('build-and-test widens its token by pull-requests: write alone, and does not persist it', () => {
  const text = ciText();
  const job = buildJob(text);
  assert.match(job, /\n {4}permissions:\n {6}contents: read\n {6}pull-requests: write\n {4}strategy:/);
  assert.match(job, /uses: actions\/checkout@[0-9a-f]{40}[^\n]*\n(?: {8}#[^\n]*\n)* {8}with:\n {10}persist-credentials: false\n/);
  const windows = text.slice(text.indexOf('\n  windows-step-fixtures-proof-of-life:'));
  assert.doesNotMatch(windows, /pull-requests:/, 'the windows job keeps the workflow-level read-only token');
  const workflowLevel = /^permissions:\n((?: {2}\S[^\n]*\n)+)/m.exec(text.slice(0, text.indexOf('\njobs:')));
  assert.ok(workflowLevel, 'a workflow-level permissions block');
  assert.equal(workflowLevel[1], '  contents: read\n', 'the widening is job-level, never workflow-level');
});

/* ---------- the script itself, under bash with stubbed tools ---------- */

function resolveBash() {
  // On Windows a bare `bash` can resolve to WSL's launcher, which would run
  // the script in another filesystem; Git for Windows' own bash is the one
  // this rig's git ships with.
  if (process.platform !== 'win32') {
    return spawnSync('bash', ['-c', 'exit 0']).error ? null : 'bash';
  }
  const exec = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  if (exec.error || exec.status !== 0) return null;
  let dir = resolve(exec.stdout.trim());
  for (let hop = 0; hop < 6; hop += 1) {
    for (const rel of [join('usr', 'bin', 'bash.exe'), join('bin', 'bash.exe')]) {
      if (existsSync(join(dir, rel))) return join(dir, rel);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const BASH = resolveBash();
const posix = (path) => path.replaceAll('\\', '/');

const STUBS = {
  git: `#!/bin/sh
echo "git $*" >> "$STUB_LOG"
case "$1" in
  rev-parse) echo true ;;
  fetch) exit "\${FETCH_EXIT:-0}" ;;
esac
`,
  node: `#!/bin/sh
echo "node $*" >> "$STUB_LOG"
if [ "\${DIFF_EXIT:-0}" != 0 ]; then
  printf 'ATLAS_DIFF_NO_BASE  The base ref carries no map.\\nexit 2\\n'
  exit "$DIFF_EXIT"
fi
printf '## Atlas: what this change does to the map\\n\\n- beta now imports tests.\\n'
`,
  gh: `#!/bin/sh
echo "gh $*" >> "$STUB_LOG"
case "$*" in
  *--paginate*) printf '%s' "$COMMENT_IDS"; exit "\${LIST_EXIT:-0}" ;;
esac
while [ $# -gt 0 ]; do
  if [ "$1" = "-F" ]; then cat "\${2#body=@}" > "$STUB_BODY"; fi
  shift
done
exit "\${WRITE_EXIT:-0}"
`,
};

function runStep(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ci-atlas-diff-'));
  try {
    const bin = join(root, 'bin');
    const temp = join(root, 'runner-temp');
    mkdirSync(bin);
    mkdirSync(temp);
    for (const [name, body] of Object.entries(STUBS)) {
      writeFileSync(join(bin, name), body);
      chmodSync(join(bin, name), 0o755);
    }
    const script = join(root, 'step.sh');
    writeFileSync(script, stepScript(ciText()));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH'));
    Object.assign(env, {
      PATH: [bin, ...(BASH === 'bash' ? [] : [dirname(BASH)]), process.env.PATH ?? process.env.Path ?? ''].join(delimiter),
      BASE_REF: 'main',
      PR_NUMBER: '97',
      HEAD_REPO: 'dogfood-lab/testing-os',
      REPO: 'dogfood-lab/testing-os',
      GH_TOKEN: 'stub',
      RUNNER_TEMP: posix(temp),
      GITHUB_STEP_SUMMARY: posix(join(root, 'summary.md')),
      STUB_LOG: posix(join(root, 'calls.log')),
      STUB_BODY: posix(join(root, 'posted.md')),
      COMMENT_IDS: '',
      ...overrides,
    });
    // The runner's default shell for `run:` is bash -e with pipefail.
    const result = spawnSync(BASH, ['--noprofile', '--norc', '-eo', 'pipefail', posix(script)], { env, encoding: 'utf8' });
    const read = (name) => (existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : null);
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls: (read('calls.log') ?? '').split('\n').filter(Boolean),
      posted: read('posted.md'),
      summary: read('summary.md'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const needsBash = { skip: BASH ? false : 'no bash found (PATH, and git --exec-path on win32)' };
const DELTA = '## Atlas: what this change does to the map\n\n- beta now imports tests.\n';

test('script: with no comment of its own yet, it posts one, marker first', needsBash, () => {
  const run = runStep();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const gh = run.calls.filter((call) => call.startsWith('gh '));
  assert.equal(gh.length, 2, gh.join('\n'));
  assert.match(gh[0], /^gh api --paginate repos\/dogfood-lab\/testing-os\/issues\/97\/comments --jq /);
  assert.match(gh[1], /^gh api --method POST repos\/dogfood-lab\/testing-os\/issues\/97\/comments -F body=@/);
  assert.equal(run.posted, `${MARKER}\n${DELTA}`);
  assert.equal(run.summary, DELTA);
  assert.ok(run.stdout.includes(DELTA), 'the delta is in the log');
  assert.ok(run.calls.includes('git fetch --no-tags --depth=1 origin +refs/heads/main:refs/remotes/origin/main'), run.calls.join('\n'));
  assert.ok(run.calls.includes('node packages/atlas/cli.js diff --base origin/main'), run.calls.join('\n'));
});

test('script: with its comment already there, it updates the first one in place and posts nothing', needsBash, () => {
  const run = runStep({ COMMENT_IDS: '4242\n5151\n' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const writes = run.calls.filter((call) => /--method (PATCH|POST)/.test(call));
  assert.deepEqual(writes.map((call) => call.split(' -F ')[0]), ['gh api --method PATCH repos/dogfood-lab/testing-os/issues/comments/4242']);
  assert.equal(run.posted, `${MARKER}\n${DELTA}`);
});

test('script: on a fork it calls no gh at all, and leaves the delta in the log and the summary', needsBash, () => {
  const run = runStep({ HEAD_REPO: 'someone/testing-os' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(run.calls.filter((call) => call.startsWith('gh ')), []);
  assert.ok(run.stdout.includes(DELTA));
  assert.match(run.stdout, /::notice::pull request from a fork/);
  assert.equal(run.summary, DELTA);
});

test('script: a comment that cannot be posted or updated is a warning, not a failed build', needsBash, () => {
  for (const overrides of [{ WRITE_EXIT: '1' }, { WRITE_EXIT: '1', COMMENT_IDS: '4242\n' }, { LIST_EXIT: '1' }]) {
    const run = runStep(overrides);
    assert.equal(run.status, 0, JSON.stringify(overrides) + run.stdout + run.stderr);
    if (overrides.WRITE_EXIT) assert.match(run.stdout, /::warning::atlas diff comment/, JSON.stringify(overrides));
  }
});

test('script: a base that cannot be fetched or carries no map ends the step with a warning and no comment', needsBash, () => {
  for (const [overrides, warning] of [[{ FETCH_EXIT: '128' }, /::warning::atlas diff skipped/], [{ DIFF_EXIT: '2' }, /ATLAS_DIFF_NO_BASE[\s\S]*::warning::atlas diff did not run/]]) {
    const run = runStep(overrides);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, warning);
    assert.deepEqual(run.calls.filter((call) => call.startsWith('gh ')), []);
    assert.equal(run.posted, null);
  }
});
