/**
 * atlas-brief.test.js — an audit lane's brief carries its domain's blast
 * radius when the repository has an Atlas map (swarms/PROTOCOL.md, Phase 1
 * and Phase 5): the "What breaks what" rows for its parts, `atlas explain
 * --json` for each entry point in its domain (capped), and a pointer to
 * "What this map cannot see" so an absence is read as unknown.
 *
 * Fixture: fixtures/swarm-atlas/mapped-repo, whose committed page says api is
 * imported by cli and, only from tests, by tests; core by api and tests; util
 * by core; and whose entry points are src/cli/main.js and src/core/index.js.
 * The Atlas CLI runs as a child process from its workspace path.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init } from './commands/init.js';
import { dispatch } from './commands/dispatch.js';
import { resume } from './commands/resume.js';
import { openDb } from './db/connection.js';
import { freezeDomains, getDomains } from './lib/domains.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MAPPED = join(REPO_ROOT, 'fixtures', 'swarm-atlas', 'mapped-repo');
const UNMAPPED = join(REPO_ROOT, 'fixtures', 'swarm-atlas', 'unmapped-repo');
const ATLAS_CLI = join(REPO_ROOT, 'packages', 'atlas', 'cli.js');
const PAGE = JSON.parse(readFileSync(join(MAPPED, 'atlas', 'page.json'), 'utf-8'));

const cleanup = [];
after(() => {
  for (const p of cleanup) {
    try { rmSync(p, { recursive: true, force: true }); } catch { /* Windows lock lag */ }
  }
});

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

function temp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

function repoFrom(fixture) {
  const repoPath = temp('swarm-atlas-brief-repo-');
  cpSync(fixture, repoPath, { recursive: true });
  git(repoPath, ['init', '-q', '-b', 'main']);
  git(repoPath, ['config', 'commit.gpgsign', 'false']);
  git(repoPath, ['config', 'core.autocrlf', 'false']);
  git(repoPath, ['add', '-A']);
  git(repoPath, ['commit', '-q', '-m', 'fixture']);
  return repoPath;
}

/** The workspace Atlas CLI as a child process, counting the explain calls. */
function countingAtlas() {
  const calls = [];
  const run = (args, opts) => {
    if (args[0] === 'explain') calls.push(args[1]);
    const r = spawnSync(process.execPath, [ATLAS_CLI, ...args], { cwd: opts.cwd, encoding: 'utf-8' });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, command: `atlas ${args.join(' ')}` };
  };
  return { run, calls };
}

function setUp(fixture, phase, { runAtlas, beforeDispatch } = {}) {
  const repoPath = repoFrom(fixture);
  const dbPath = join(temp('swarm-atlas-brief-db-'), 'control-plane.db');
  const outputDir = temp('swarm-atlas-brief-out-');
  const { runId } = init({ repoPath, dbPath });
  const db = openDb(dbPath);
  const atlas = runAtlas ?? countingAtlas().run;
  freezeDomains(db, runId, { runAtlas: atlas });
  if (beforeDispatch) beforeDispatch(repoPath);
  const result = dispatch({ runId, phase, dbPath, outputDir, runAtlas: atlas });
  const prompts = new Map(result.agents.map((a) => [a.domain, readFileSync(a.promptPath, 'utf-8')]));
  return { repoPath, dbPath, outputDir, runId, db, result, prompts };
}

function promptOwning(ctx, glob) {
  const domain = getDomains(ctx.db, ctx.runId).find((d) => d.globs.includes(glob));
  assert.ok(domain, `a domain owns ${glob}`);
  return { name: domain.name, text: ctx.prompts.get(domain.name) };
}

describe('audit briefs in a mapped repository carry the lane\'s blast radius', () => {
  let ctx;
  let atlas;
  before(() => {
    atlas = countingAtlas();
    ctx = setUp(MAPPED, 'health-audit-a', { runAtlas: atlas.run });
  });

  it('every audit brief has the section, names the map commit, and says it is derived', () => {
    assert.ok(ctx.prompts.size > 0);
    for (const [domain, text] of ctx.prompts) {
      assert.match(text, /## Blast radius/, `${domain} brief has the section`);
      assert.ok(text.includes(PAGE.commit.slice(0, 12)), `${domain} brief names the map commit`);
      assert.match(text, /derived/i, `${domain} brief says the facts are derived`);
    }
  });

  it('points at what the map cannot see, and lists it', () => {
    for (const [domain, text] of ctx.prompts) {
      assert.match(text, /What this map cannot see/, domain);
      for (const limit of PAGE.limits) assert.ok(text.includes(limit), `${domain} brief lists: ${limit}`);
    }
  });

  it("gives the lane holding core the \"What breaks what\" row for core: its importers, split by tests", () => {
    const { text } = promptOwning(ctx, 'src/core/**');
    assert.match(text, /\*\*core\*\* is imported by api/);
    assert.match(text, /\*\*core\*\*[^\n]*only from tests by tests/);
  });

  it('explains each entry point in the lane\'s domain with atlas explain --json', () => {
    const { text } = promptOwning(ctx, 'src/core/**');
    assert.ok(text.includes('`src/core/index.js`'), 'the core entry point is named');
    assert.match(text, /"part": "core"/);
    const cli = promptOwning(ctx, 'src/cli/**');
    assert.ok(cli.text.includes('`src/cli/main.js`'), 'the cli entry point is named in its own lane');
  });

  it('runs atlas explain once per entry point per wave, not once per lane', () => {
    assert.deepEqual([...atlas.calls].sort(), ['src/cli/main.js', 'src/core/index.js']);
  });

  it('tells a lane none of whose parts is imported so, rather than leaving the section empty', () => {
    const { text } = promptOwning(ctx, 'docs/**');
    assert.match(text, /No part in this domain is imported by another part/);
  });

  it('records the section on the wave so a resumed lane gets the same text', () => {
    const later = Date.now() + 24 * 60 * 60 * 1000;
    resume({ runId: ctx.runId, dbPath: ctx.dbPath, outputDir: ctx.outputDir, nowMs: later });
    const dir = join(ctx.outputDir, 'wave-1-resume');
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    assert.ok(files.length > 0, 'resume redispatched the timed-out lanes');
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf-8');
      const original = ctx.prompts.get(f.replace(/\.md$/, ''));
      const section = (t) => t.slice(t.indexOf('## Blast radius'), t.indexOf('## Audit Lens'));
      assert.ok(text.includes('## Blast radius'), `${f} resumed brief has the section`);
      assert.equal(section(text), section(original), `${f} resumed section matches the dispatched one`);
    }
  });
});

describe('the blast radius degrades, and is bounded', () => {
  it('keeps the rows and says so when atlas explain cannot run', () => {
    const failing = () => ({ status: 1, stdout: '', stderr: 'network unreachable', command: 'atlas explain' });
    const ctx = setUp(MAPPED, 'health-audit-a', {
      runAtlas: (args, opts) => (args[0] === 'check' ? countingAtlas().run(args, opts) : failing()),
    });
    const { text } = promptOwning(ctx, 'src/core/**');
    assert.match(text, /\*\*core\*\* is imported by api/);
    assert.match(text, /atlas explain could not run/);
  });

  it('explains at most five entry points in one lane and names the rest', () => {
    const atlas = countingAtlas();
    const extra = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => `src/core/${n}.js`);
    const ctx = setUp(MAPPED, 'health-audit-a', {
      runAtlas: atlas.run,
      beforeDispatch: (repoPath) => {
        const path = join(repoPath, 'atlas', 'structure.json');
        const structure = JSON.parse(readFileSync(path, 'utf-8'));
        structure.boundaries.find((b) => b.name === 'core').entryPoints.push(...extra);
        writeFileSync(path, JSON.stringify(structure));
      },
    });
    const { text } = promptOwning(ctx, 'src/core/**');
    const explainedInCore = atlas.calls.filter((f) => f.startsWith('src/core/'));
    assert.equal(explainedInCore.length, 5);
    assert.match(text, /2 more entry points not explained/);
  });
});

describe('the other briefs', () => {
  it('a feature-audit brief (Phase 5) carries the section too', () => {
    const ctx = setUp(MAPPED, 'feature-audit');
    for (const [domain, text] of ctx.prompts) assert.match(text, /## Blast radius/, domain);
  });

  it('a repository without a boundary file gets briefs without the section', () => {
    const ctx = setUp(UNMAPPED, 'health-audit-a');
    assert.ok(ctx.prompts.size > 0);
    for (const [domain, text] of ctx.prompts) assert.doesNotMatch(text, /Blast radius/, domain);
  });
});
