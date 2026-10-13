import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { annotationLines, escapeData, escapeProperty, stepSummary } from './actions.js';
import { mappedRepository } from '../sidecar/test-client.js';

// docs/atlas-buildup.spec.md, slice AM, item AM-6: in GitHub Actions, check
// says its failure and notices as annotations and in the step summary, where
// a failure email and a pull request's checks tab look; outside Actions its
// output is the log's alone, as before. What GitHub then shows is GitHub's
// behaviour, proven by one live failing run before release (the spec's
// required addition); these tests hold what check prints and writes.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function scratch(prefix = 'atlas-actions-') {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function write(repo, path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

// A mapped repository whose receipts/ is in no part, at `dir`, then `count`
// new receipts staged: the live run's shape, ATLAS_UNASSIGNED_NEW on each.
function receiptsRepo(dir, count) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '--quiet']);
  write(dir, 'src/route.py', 'def route():\n    return 1\n');
  write(dir, 'receipts/e0.jsonl', '{"run": 0}\n');
  write(dir, 'atlas/boundaries.yaml', 'boundaries:\n  - name: src\n    globs:\n      - src/**\n    role: code\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'repo']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: dir, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', 'map']);
  for (let i = 1; i <= count; i += 1) write(dir, `receipts/e${String(i).padStart(2, '0')}.jsonl`, `{"run": ${i}}\n`);
  git(dir, ['add', '-A']);
  return dir;
}

function check(cwd, env) {
  const base = { ...process.env };
  for (const key of ['GITHUB_ACTIONS', 'GITHUB_STEP_SUMMARY', 'GITHUB_WORKSPACE']) delete base[key];
  return spawnSync(process.execPath, [CLI, 'check'], { cwd, encoding: 'utf8', env: { ...base, ...env } });
}

function commands(stdout) {
  return stdout.split('\n').filter((line) => line.startsWith('::'));
}

describe('workflow command escaping', () => {
  it('escapes a message so a newline and :: start no command of their own', () => {
    assert.equal(escapeData('a%b\r\n::warning::x'), 'a%25b%0D%0A::warning::x');
  });

  it('escapes a property, where : and , delimit too', () => {
    assert.equal(escapeProperty('dir/a,b:c\n.json'), 'dir/a%2Cb%3Ac%0A.json');
  });

  it('keeps a path with a newline and :: inside one annotation', () => {
    const lines = annotationLines({
      failure: { code: 'ATLAS_UNASSIGNED_NEW', details: ['data/x\n::error::forged'], whatToDo: 'stage the new files', paths: ['data/x\n::error::forged'] },
      notices: [],
      summary: true,
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].split('\n').length, 1);
    assert.match(lines[0], /^::error title=ATLAS_UNASSIGNED_NEW,file=data\/x%0A%3A%3Aerror%3A%3Aforged,line=1::/);
  });

  it('sets a repository string in the summary as code, never as Markdown', () => {
    const text = stepSummary({ failure: { code: 'ATLAS_UNASSIGNED_NEW', details: ['a`b[c](http://x)\n## y'], whatToDo: 'stage the new files' }, notices: [] });
    assert.ok(text.includes('- ``a`b[c](http://x)\\n## y``'), text);
  });
});

describe('atlas check in GitHub Actions', () => {
  it('annotates each new file in no part, ten at most, the tenth counting the rest, and writes the fix to the summary', () => {
    const repo = receiptsRepo(scratch(), 12);
    const summary = join(scratch(), 'summary.md');
    const result = check(repo, { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: repo, GITHUB_STEP_SUMMARY: summary });
    assert.equal(result.status, 1, result.stdout);
    const errors = commands(result.stdout).filter((line) => line.startsWith('::error '));
    assert.equal(errors.length, 10, result.stdout);
    // Line 1: on the live run of 2026-10-13 (#160), an annotation with no
    // line was stored at line 0 and never shown on the pull request's diff.
    assert.equal(errors[0], '::error title=ATLAS_UNASSIGNED_NEW,file=receipts/e01.jsonl,line=1::A tracked file is unassigned and was not unassigned before. receipts/e01.jsonl. What to do: add the boundary lines in the step summary to atlas/boundaries.yaml, stage the new files, run atlas map and commit atlas/; or revert the change.');
    assert.match(errors[9], /file=receipts\/e10\.jsonl,line=1::.* And 2 more files; the log and the step summary list them all\.$/);
    const text = readFileSync(summary, 'utf8');
    assert.ok(text.startsWith('## Atlas check failed\n\n**ATLAS_UNASSIGNED_NEW**: A tracked file is unassigned and was not unassigned before.\n'), text);
    assert.ok(text.includes('- `receipts/e12.jsonl`'), text);
    assert.ok(text.includes('```text\na new part, at the end of boundaries:\n  - name: receipts\n    globs:\n      - receipts/**\n    role: data\n```'), text);
  });

  it('names the file from the repository root, wherever the checkout sits in the workspace', () => {
    // The live run on #160: a job that checked out into path: repo gave
    // repo/... paths, relative to the workspace, and GitHub showed none of
    // them on the diff; the jobs whose paths began at the repository root
    // were shown.
    const ws = scratch();
    const repo = receiptsRepo(join(ws, 'interlock'), 1);
    const result = check(repo, { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: ws });
    assert.equal(result.status, 1, result.stdout);
    assert.match(commands(result.stdout)[0], /^::error title=ATLAS_UNASSIGNED_NEW,file=receipts\/e01\.jsonl,line=1::.*boundary lines in the log/);
    const outside = check(receiptsRepo(scratch(), 1), { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: scratch() });
    assert.match(commands(outside.stdout)[0], /^::error title=ATLAS_UNASSIGNED_NEW,file=receipts\/e01\.jsonl,line=1::/);
  });

  it('puts a door notice as a warning on the line it was read from', () => {
    const repo = mappedRepository(join(FIXTURES, 'door-toolchain'), { prefix: 'atlas-actions-door-' });
    roots.push(repo);
    const summary = join(scratch(), 'summary.md');
    const result = check(repo, { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: repo, GITHUB_STEP_SUMMARY: summary });
    assert.equal(result.status, 0, result.stdout);
    const warnings = commands(result.stdout).filter((line) => line.startsWith('::warning '));
    assert.ok(warnings.length > 0, result.stdout);
    assert.match(warnings[0], /^::warning title=ATLAS_DOOR_TOOLCHAIN,file=\.github\/workflows\/[^,]+,line=\d+::A door pins a runtime version the tool it runs does not accept\./);
    assert.ok(readFileSync(summary, 'utf8').startsWith('## Atlas check passed, with notices\n'));
  });

  it('ends the details once, though a detail ends its own sentence', () => {
    // The live run of 2026-10-13 read "refuses to start.; read from".
    const notice = { code: 'ATLAS_DOOR_TOOLCHAIN', details: ['astro refuses to start.', 'read from a.yml:3'], whatToDo: 'pin Node 22', file: 'a.yml', line: 3 };
    const [line] = annotationLines({ failure: null, notices: [notice], summary: false });
    assert.match(line, / astro refuses to start; read from a\.yml:3\. What to do: pin Node 22\.$/);
    // A path is data: a file name that ends in a dot keeps it.
    const failure = { code: 'ATLAS_FILE_MOVED', details: ['notes/draft.'], whatToDo: 'run atlas map' };
    const [error] = annotationLines({ failure, notices: [], summary: false });
    assert.match(error, / notes\/draft\.\. What to do: /);
  });

  it('ends a notice\'s details once in the step summary too', () => {
    // The second live run's summary, read signed in, still had
    // "refuses to start.; read from": the summary joins its details itself.
    const notice = { code: 'ATLAS_DOOR_TOOLCHAIN', details: ['astro refuses to start.', 'read from a.yml:3'], whatToDo: 'pin Node 22', file: 'a.yml', line: 3 };
    const text = stepSummary({ failure: null, notices: [notice] });
    assert.ok(text.includes('`astro refuses to start`; `read from a.yml:3`. **What to do:**'), text);
  });

  it('caps the summary list with how many more', () => {
    const repo = receiptsRepo(scratch(), 60);
    const summary = join(scratch(), 'summary.md');
    check(repo, { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: repo, GITHUB_STEP_SUMMARY: summary });
    const text = readFileSync(summary, 'utf8');
    assert.ok(text.includes('- `receipts/e50.jsonl`\n- and 10 more\n'), text);
    assert.ok(!text.includes('receipts/e51.jsonl'), text);
  });

  it('writes nothing for a check that passes with nothing to say', () => {
    const repo = receiptsRepo(scratch(), 0);
    const summary = join(scratch(), 'summary.md');
    const result = check(repo, { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: repo, GITHUB_STEP_SUMMARY: summary });
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(commands(result.stdout), []);
    assert.equal(existsSync(summary), false);
  });
});

describe('atlas check outside GitHub Actions', () => {
  it('prints the log alone, the same with GITHUB_ACTIONS unset or false, and writes no summary', () => {
    const repo = receiptsRepo(scratch(), 12);
    const summary = join(scratch(), 'summary.md');
    const unset = check(repo, { GITHUB_STEP_SUMMARY: summary, GITHUB_WORKSPACE: repo });
    const off = check(repo, { GITHUB_ACTIONS: 'false', GITHUB_STEP_SUMMARY: summary, GITHUB_WORKSPACE: repo });
    assert.equal(unset.status, 1);
    assert.equal(unset.stdout, off.stdout);
    assert.deepEqual(commands(unset.stdout), []);
    assert.equal(existsSync(summary), false);
    const inActions = check(repo, { GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: repo });
    assert.ok(inActions.stdout.startsWith(unset.stdout), 'the log is the same, with the annotations after it');
  });
});
