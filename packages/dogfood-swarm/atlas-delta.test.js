/**
 * atlas-delta.test.js — the serial verify of a mapped repository runs
 * `atlas check`, and on an amend wave records the wave's structural delta;
 * a delta that adds an import between parts, closes a cycle, or gives a
 * place a new writer is an andon on advance until the Director disposes of it
 * (swarms/PROTOCOL.md, "The structural delta").
 *
 * Fixture: fixtures/swarm-atlas/mapped-repo, copied into a temporary git
 * repository. Each scenario edits the code the way an amend lane would,
 * regenerates the map the way the coordinator does before the serial verify,
 * and runs `swarm verify`. The Atlas CLI runs as a child process from its
 * workspace path.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init } from './commands/init.js';
import { verify } from './commands/verify.js';
import { openDb } from './db/connection.js';
import { freezeDomains, getDomains } from './lib/domains.js';
import { advance, checkGates } from './lib/advance.js';
import { status } from './commands/status.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MAPPED = join(REPO_ROOT, 'fixtures', 'swarm-atlas', 'mapped-repo');
const UNMAPPED = join(REPO_ROOT, 'fixtures', 'swarm-atlas', 'unmapped-repo');
const ATLAS_CLI = join(REPO_ROOT, 'packages', 'atlas', 'cli.js');

const cleanup = [];
after(() => {
  for (const p of cleanup) {
    try { rmSync(p, { recursive: true, force: true }); } catch { /* Windows lock lag */ }
  }
});

function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test',
    },
  });
}

function atlas(args, opts) {
  const r = spawnSync(process.execPath, [ATLAS_CLI, ...args], { cwd: opts.cwd, encoding: 'utf-8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, command: `atlas ${args.join(' ')}` };
}

// The node adapter's steps with a test step that passes and counts, so the
// verdict is decided by the Atlas step alone.
const scriptDir = temp('swarm-atlas-delta-steps-');
const passScript = join(scriptDir, 'pass.mjs');
writeFileSync(passScript, "console.log('Tests:  3 passed');\n");
const OVERRIDES = {
  lint: { name: 'lint', cmd: 'node', args: ['-e', '"process.exit(0)"'], optional: true },
  typecheck: { name: 'typecheck', cmd: 'node', args: ['-e', '"process.exit(0)"'], optional: true },
  build: { name: 'build', cmd: 'node', args: ['-e', '"process.exit(0)"'], optional: true },
  test: { name: 'test', cmd: 'node', args: [passScript] },
};

/**
 * A run on a copy of `fixture` whose latest wave is a collected `phase`
 * wave dispatched at the fixture's first commit.
 */
function runWithWave(fixture, phase) {
  const repoPath = temp('swarm-atlas-delta-repo-');
  cpSync(fixture, repoPath, { recursive: true });
  git(repoPath, ['init', '-q', '-b', 'main']);
  git(repoPath, ['config', 'commit.gpgsign', 'false']);
  git(repoPath, ['config', 'core.autocrlf', 'false']);
  git(repoPath, ['add', '-A']);
  git(repoPath, ['commit', '-q', '-m', 'fixture']);
  const dbPath = join(temp('swarm-atlas-delta-db-'), 'control-plane.db');
  const { runId } = init({ repoPath, dbPath });
  const db = openDb(dbPath);
  freezeDomains(db, runId, { runAtlas: atlas });
  const head = git(repoPath, ['rev-parse', 'HEAD']).trim();
  const wave = db.prepare(
    "INSERT INTO waves (run_id, phase, wave_number, status, dispatch_sha) VALUES (?, ?, 1, 'collected', ?)"
  ).run(runId, phase, head);
  const waveId = Number(wave.lastInsertRowid);
  for (const d of getDomains(db, runId).filter((x) => x.ownership_class === 'owned')) {
    db.prepare("INSERT INTO agent_runs (wave_id, domain_id, status) VALUES (?, ?, 'complete')").run(waveId, d.id);
  }
  db.prepare('UPDATE runs SET status = ? WHERE id = ?').run(phase, runId);
  return { repoPath, dbPath, runId, db, waveId };
}

function edit(repoPath, rel, text) {
  appendFileSync(join(repoPath, rel), text);
}

/** The coordinator's step before the serial verify: regenerate the page. */
function remap(repoPath) {
  const r = atlas(['map'], { cwd: repoPath });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

function runVerify(ctx) {
  return verify({ runId: ctx.runId, dbPath: ctx.dbPath, override: 'node', commandOverrides: OVERRIDES, runAtlas: atlas });
}

function recordedDelta(ctx) {
  const row = ctx.db.prepare('SELECT value FROM kv WHERE key = ?').get(`atlas_delta:wave:${ctx.waveId}`);
  return row ? JSON.parse(row.value) : null;
}

function deltaGate(ctx) {
  return checkGates(ctx.db, ctx.runId).gates.find((g) => g.name === 'atlas_delta');
}

describe('the serial verify of a mapped repository runs atlas check', () => {
  it('adds a passing atlas-check step when the committed map still matches', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    const result = runVerify(ctx);
    const step = result.steps.find((s) => s.name === 'atlas-check');
    assert.ok(step, 'the verify has an atlas-check step');
    assert.equal(step.passed, true);
    assert.equal(step.optional, false);
    assert.equal(result.verdict, 'pass');
  });

  it('fails the verify when the change left the committed map stale', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    edit(ctx.repoPath, 'src/cli/main.js', "import { greet } from '../core/engine.js';\nconsole.log(greet('x'));\n");
    const result = runVerify(ctx);
    const step = result.steps.find((s) => s.name === 'atlas-check');
    assert.equal(step.passed, false);
    assert.equal(result.verdict, 'fail');
    assert.match(result.reason, /atlas check/);
  });

  it('adds no Atlas step to a repository without a boundary file', () => {
    const ctx = runWithWave(UNMAPPED, 'health-amend-a');
    const result = runVerify(ctx);
    assert.ok(!result.steps.some((s) => s.name === 'atlas-check'));
    assert.equal(recordedDelta(ctx), null);
    assert.equal(deltaGate(ctx).passed, true);
  });
});

describe("an amend wave's structural delta is recorded before the confirming audit", () => {
  it('records "nothing structural changed" and passes the gate when only content moved', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    edit(ctx.repoPath, 'docs/guide.md', '\nMore words.\n');
    remap(ctx.repoPath);
    runVerify(ctx);
    const delta = recordedDelta(ctx);
    assert.ok(delta, 'the delta is on the wave');
    assert.equal(delta.unchanged, true);
    assert.deepEqual(delta.flagged, []);
    assert.equal(deltaGate(ctx).passed, true);
  });

  it('diffs against the commit the wave was dispatched at', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    runVerify(ctx);
    assert.equal(recordedDelta(ctx).base, git(ctx.repoPath, ['rev-parse', 'HEAD']).trim());
  });

  it('is an andon when the wave adds an import between parts', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    edit(ctx.repoPath, 'src/cli/main.js', "import { greet } from '../core/engine.js';\nconsole.log(greet('x'));\n");
    remap(ctx.repoPath);
    const result = runVerify(ctx);
    assert.equal(result.verdict, 'pass', 'the regenerated map passes the check');
    const delta = recordedDelta(ctx);
    assert.deepEqual(delta.flagged.map((i) => i.kind), ['import-added']);
    assert.match(delta.flagged[0].sentence, /cli now imports core/);
    const gate = deltaGate(ctx);
    assert.equal(gate.passed, false);
    assert.equal(gate.verdict, 'BLOCK');
    assert.equal(gate.overridable, true);
    assert.match(gate.reason, /cli now imports core/);
  });

  it('is an andon when the wave closes a cycle', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    edit(ctx.repoPath, 'src/util/strings.js', "export { handle } from '../api/server.js';\n");
    remap(ctx.repoPath);
    runVerify(ctx);
    const delta = recordedDelta(ctx);
    assert.deepEqual(delta.flagged.map((i) => i.kind), ['cycle']);
    assert.match(delta.flagged[0].sentence, /closes the cycle/);
    assert.equal(deltaGate(ctx).passed, false);
  });

  it('is an andon when the wave gives a place a new writer', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    edit(ctx.repoPath, 'src/cli/main.js', [
      "import { writeFileSync } from 'node:fs';",
      "import { join } from 'node:path';",
      "writeFileSync(join(import.meta.dirname, '..', '..', 'docs', 'guide.md'), 'generated');",
      '',
    ].join('\n'));
    remap(ctx.repoPath);
    runVerify(ctx);
    const delta = recordedDelta(ctx);
    assert.ok(delta.flagged.some((i) => i.kind === 'landing' && /written by/.test(i.sentence)),
      `a new writer is flagged; the delta was ${JSON.stringify(delta.items)}`);
    assert.equal(deltaGate(ctx).passed, false);
  });

  it('keeps swarm status from calling a wave with a flagged delta ready to advance', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    edit(ctx.repoPath, 'src/cli/main.js', "import { greet } from '../core/engine.js';\nconsole.log(greet('x'));\n");
    remap(ctx.repoPath);
    runVerify(ctx);
    const s = status({ runId: ctx.runId, dbPath: ctx.dbPath });
    assert.equal(s.assessment.state, 'STRUCTURAL CHANGE TO REVIEW');
    assert.match(s.assessment.nextAction, /--override --reason/);
  });

  it('lets the Director dispose of the andon with an override that names the reason', () => {
    const ctx = runWithWave(MAPPED, 'health-amend-a');
    edit(ctx.repoPath, 'src/cli/main.js', "import { greet } from '../core/engine.js';\nconsole.log(greet('x'));\n");
    remap(ctx.repoPath);
    runVerify(ctx);
    const blocked = advance(ctx.db, ctx.runId, {});
    assert.notEqual(blocked.verdict, 'ADVANCE');
    const disposed = advance(ctx.db, ctx.runId, { override: true, overrideReason: 'F-cafe0001 asked cli to call core directly', authorizedBy: 'director' });
    assert.match(disposed.verdict, /ADVANCE/);
  });

  it('records no delta for an audit wave, whose verify still runs the check', () => {
    const ctx = runWithWave(MAPPED, 'health-audit-a');
    const result = runVerify(ctx);
    assert.ok(result.steps.some((s) => s.name === 'atlas-check'));
    assert.equal(recordedDelta(ctx), null);
  });
});
