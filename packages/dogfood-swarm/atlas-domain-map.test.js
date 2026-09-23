/**
 * atlas-domain-map.test.js — the domain map is drafted from a repository's
 * Atlas parts when it has adopted Atlas, and from the hand template when it
 * has not (swarms/PROTOCOL.md, "Domain Agent Assignments").
 *
 * Fixtures: fixtures/swarm-atlas/mapped-repo is a small repository with a
 * boundary file of eight parts and the map `atlas map` wrote for it;
 * fixtures/swarm-atlas/unmapped-repo has no atlas/ directory. Each test copies
 * one into a temporary git repository, because the population a domain map
 * must cover is what git tracks there.
 *
 * Exclusivity is checked twice, by two matchers: minimatch over `git ls-files`
 * here, and the Atlas engine itself, which is handed the derived domains as a
 * boundary file and asked to map the repository. The engine is run as a child
 * process from its workspace path, the way a rig runs the published binary;
 * nothing here imports it.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minimatch } from 'minimatch';

import { init } from './commands/init.js';
import { openDb } from './db/connection.js';
import { detectDomains, freezeDomains, getDomains, getDomainEvents } from './lib/domains.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MAPPED = join(REPO_ROOT, 'fixtures', 'swarm-atlas', 'mapped-repo');
const UNMAPPED = join(REPO_ROOT, 'fixtures', 'swarm-atlas', 'unmapped-repo');
const ATLAS_CLI = join(REPO_ROOT, 'packages', 'atlas', 'cli.js');
const SWARM_CLI = join(HERE, 'cli.js');

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

function repoFrom(fixture) {
  const repoPath = mkdtempSync(join(tmpdir(), 'swarm-atlas-repo-'));
  cleanup.push(repoPath);
  cpSync(fixture, repoPath, { recursive: true });
  git(repoPath, ['init', '-q', '-b', 'main']);
  git(repoPath, ['config', 'commit.gpgsign', 'false']);
  git(repoPath, ['config', 'core.autocrlf', 'false']);
  git(repoPath, ['add', '-A']);
  git(repoPath, ['commit', '-q', '-m', 'fixture']);
  return repoPath;
}

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-atlas-db-'));
  cleanup.push(dir);
  return join(dir, 'control-plane.db');
}

function tracked(repoPath) {
  return git(repoPath, ['ls-files', '-z']).split('\0').filter(Boolean);
}

function lineageOf(db, runId) {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(`atlas_map:${runId}`);
  return row ? JSON.parse(row.value) : null;
}

// The Atlas CLI as a child process, the shape the swarm's own runner has.
function workspaceAtlas(args, opts) {
  const r = spawnSync(process.execPath, [ATLAS_CLI, ...args], { cwd: opts.cwd, encoding: 'utf-8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, command: `atlas ${args.join(' ')}` };
}

const committedStructure = JSON.parse(readFileSync(join(MAPPED, 'atlas', 'structure.json'), 'utf-8'));
const committedPage = JSON.parse(readFileSync(join(MAPPED, 'atlas', 'page.json'), 'utf-8'));
const partGlobs = new Map(committedStructure.boundaries.map((b) => [b.name, b.globs]));

describe('a repository with atlas/boundaries.yaml: the draft starts from its parts', () => {
  let repoPath;
  let dbPath;
  let result;
  let db;

  before(() => {
    repoPath = repoFrom(MAPPED);
    dbPath = tempDb();
    result = init({ repoPath, dbPath });
    db = openDb(dbPath);
  });

  it('merges the eight parts into five agent domains plus the coordinator-held map', () => {
    const domains = getDomains(db, result.runId);
    const owned = domains.filter((d) => d.ownership_class === 'owned');
    assert.equal(owned.length, 5, `expected five owned domains, got ${domains.map((d) => d.name).join(', ')}`);
    const map = domains.find((d) => d.name === 'atlas-map');
    assert.ok(map, 'the committed map gets its own domain');
    assert.equal(map.ownership_class, 'coordinator');
    assert.deepEqual(map.globs, ['atlas/**']);
    assert.equal(domains.length, 6);
  });

  it('records which parts each domain came from, every part exactly once', () => {
    const lineage = lineageOf(db, result.runId);
    assert.ok(lineage, 'init records the Atlas lineage of the draft');
    assert.equal(lineage.mapCommit, committedPage.commit);
    const parts = lineage.domains.flatMap((d) => d.parts).sort();
    assert.deepEqual(parts, [...partGlobs.keys()].sort());
  });

  it("gives every domain the union of its parts' globs, plus the literal path of a file the map left unassigned", () => {
    const lineage = lineageOf(db, result.runId);
    const placed = new Map(lineage.placed.map((p) => [p.file, p.domain]));
    assert.deepEqual([...placed.keys()], ['src/.gitkeep']);
    for (const domain of getDomains(db, result.runId).filter((d) => d.ownership_class === 'owned')) {
      const parts = lineage.domains.find((d) => d.name === domain.name).parts;
      const expected = parts.flatMap((p) => partGlobs.get(p));
      for (const [file, owner] of placed) if (owner === domain.name) expected.push(file);
      assert.deepEqual([...domain.globs].sort(), [...new Set(expected)].sort(), domain.name);
    }
  });

  it('lets the tests part join the part it imports rather than stand alone', () => {
    const lineage = lineageOf(db, result.runId);
    const holder = lineage.domains.find((d) => d.parts.includes('tests'));
    assert.ok(holder.parts.length > 1, 'tests is merged into a code domain');
    assert.ok(holder.parts.includes('core') || holder.parts.includes('api'),
      `tests imports core and api, so it joins one of them; it joined ${holder.parts.join(', ')}`);
  });

  it('covers every tracked file exactly once (minimatch over git ls-files)', () => {
    const domains = getDomains(db, result.runId);
    for (const file of tracked(repoPath)) {
      const owners = domains.filter((d) => d.globs.some((g) => minimatch(file, g, { dot: true })));
      assert.equal(owners.length, 1, `${file} is owned by ${owners.map((d) => d.name).join(', ') || 'nothing'}`);
    }
  });

  it('is exclusive and complete by the Atlas engine too, when the derived domains are its boundary file', () => {
    const copy = mkdtempSync(join(tmpdir(), 'swarm-atlas-as-boundaries-'));
    cleanup.push(copy);
    cpSync(repoPath, copy, { recursive: true });
    const owned = getDomains(db, result.runId).filter((d) => d.ownership_class === 'owned');
    // JSON is YAML, so the engine reads the derived map with no converter.
    writeFileSync(join(copy, 'atlas', 'boundaries.yaml'),
      JSON.stringify({ boundaries: owned.map((d) => ({ name: d.name, globs: d.globs, role: 'code' })) }, null, 2));
    const mapped = spawnSync(process.execPath, [ATLAS_CLI, 'map'], { cwd: copy, encoding: 'utf-8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    const structure = JSON.parse(readFileSync(join(copy, 'atlas', 'structure.json'), 'utf-8'));
    assert.deepEqual(structure.overlaps, []);
    assert.deepEqual(structure.unassigned, []);
  });
});

describe('the freeze of an Atlas-drafted map runs atlas check and records the map it came from', () => {
  it('freezes, recording the map commit and the passed check', () => {
    const repoPath = repoFrom(MAPPED);
    const dbPath = tempDb();
    const { runId } = init({ repoPath, dbPath });
    const db = openDb(dbPath);
    freezeDomains(db, runId, { runAtlas: workspaceAtlas });
    const lineage = lineageOf(db, runId);
    assert.equal(lineage.freeze.check, 'passed');
    assert.equal(lineage.freeze.mapCommit, committedPage.commit);
    assert.equal(lineage.freeze.headCommit, git(repoPath, ['rev-parse', 'HEAD']).trim());
    const frozen = getDomainEvents(db, runId).filter((e) => e.event_type === 'frozen');
    assert.ok(frozen.length > 0);
    assert.ok(frozen.every((e) => e.reason.includes(committedPage.commit.slice(0, 12))),
      'the freeze event names the map commit');
  });

  it('refuses the freeze when atlas check fails, and leaves the draft unfrozen', () => {
    const repoPath = repoFrom(MAPPED);
    const dbPath = tempDb();
    const { runId } = init({ repoPath, dbPath });
    // util now imports api: a new edge between parts the committed map does not have.
    appendFileSync(join(repoPath, 'src', 'util', 'strings.js'), "export { handle } from '../api/server.js';\n");
    git(repoPath, ['commit', '-q', '-am', 'util imports api']);
    const db = openDb(dbPath);
    assert.throws(() => freezeDomains(db, runId, { runAtlas: workspaceAtlas }), /atlas check/);
    assert.ok(getDomains(db, runId).every((d) => !d.frozen));
  });
});

describe('a repository without atlas/boundaries.yaml swarms from the hand template exactly as before', () => {
  it('drafts the hand template, records no Atlas lineage, and never runs atlas at the freeze', () => {
    const repoPath = repoFrom(UNMAPPED);
    const dbPath = tempDb();
    const result = init({ repoPath, dbPath });
    const db = openDb(dbPath);
    const expected = detectDomains(repoPath).domains
      .map((d) => ({ name: d.name, globs: d.globs, ownership_class: d.ownership_class }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const drafted = getDomains(db, result.runId)
      .map((d) => ({ name: d.name, globs: d.globs, ownership_class: d.ownership_class }));
    assert.deepEqual(drafted, expected);
    assert.equal(lineageOf(db, result.runId), null);

    let ran = 0;
    freezeDomains(db, result.runId, { runAtlas: () => { ran += 1; return { status: 1, stdout: '', stderr: '', command: 'atlas' }; } });
    assert.equal(ran, 0, 'atlas is never run for an unmapped repository');
  });
});

describe('swarm init and swarm domains flags', () => {
  function swarm(args, dbPath) {
    return spawnSync(process.execPath, [SWARM_CLI, ...args], {
      encoding: 'utf-8', env: { ...process.env, SWARM_DB: dbPath },
    });
  }

  it('--no-atlas keeps the hand template; domains --from-atlas then redrafts it from the parts', () => {
    const repoPath = repoFrom(MAPPED);
    const dbPath = tempDb();
    const created = swarm(['init', repoPath, '--no-atlas'], dbPath);
    assert.equal(created.status, 0, created.stderr);
    const runId = /Run created: (\S+)/.exec(created.stdout)[1];
    const db = openDb(dbPath);
    assert.equal(lineageOf(db, runId), null);
    assert.ok(!getDomains(db, runId).some((d) => d.name === 'atlas-map'));

    const redrafted = swarm(['domains', runId, '--from-atlas', '--domains', '6'], dbPath);
    assert.equal(redrafted.status, 0, redrafted.stdout + redrafted.stderr);
    const domains = getDomains(db, runId);
    assert.equal(domains.filter((d) => d.ownership_class === 'owned').length, 6);
    assert.ok(domains.some((d) => d.name === 'atlas-map'));
    assert.equal(lineageOf(db, runId).target, 6);
  });

  it('--tests-domain keeps the test part as its own domain named tests', () => {
    const repoPath = repoFrom(MAPPED);
    const dbPath = tempDb();
    const created = swarm(['init', repoPath, '--tests-domain'], dbPath);
    assert.equal(created.status, 0, created.stderr);
    const runId = /Run created: (\S+)/.exec(created.stdout)[1];
    const db = openDb(dbPath);
    const tests = getDomains(db, runId).find((d) => d.name === 'tests');
    assert.ok(tests, 'a tests domain exists');
    assert.deepEqual(tests.globs, ['tests/**']);
  });

  it('domains --from-atlas on a repository without a boundary file refuses and names the file', () => {
    const repoPath = repoFrom(UNMAPPED);
    const dbPath = tempDb();
    const created = swarm(['init', repoPath], dbPath);
    const runId = /Run created: (\S+)/.exec(created.stdout)[1];
    const refused = swarm(['domains', runId, '--from-atlas'], dbPath);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stdout + refused.stderr, /atlas\/boundaries\.yaml/);
  });
});
