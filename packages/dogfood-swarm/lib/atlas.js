/**
 * atlas.js — what the swarm reads from a repository's Atlas map, and how it
 * runs the Atlas command line.
 *
 * Atlas is never a prerequisite. A repository without `atlas/boundaries.yaml`
 * gets `{ adopted: false }` here and every caller keeps its hand-map behavior.
 *
 * This package does not import `@dogfood-lab/atlas`: the workspace graph keeps
 * atlas free of siblings and keeps the swarm free of atlas (CLAUDE.md, the
 * workspace dependency graph). The map is read as the files Atlas commits, and
 * the checks the map owns (`check`, `diff`, `explain`) run as the published
 * binary, pinned so a wave's structural receipt is reproducible.
 *
 * `atlas/structure.json` is read, not `atlas/boundaries.yaml`: it carries the
 * boundary file's parts (names, globs, roles) as JSON, plus the per-file roster
 * and the files no part claims, and `atlas check` fails on any difference
 * between the two. Reading it needs no YAML parser, so the swarm gains no
 * dependency.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { readBoundedJson } from './bounded-json-read.js';

/** The published Atlas the swarm runs. Bump with the lockstep release. */
export const ATLAS_VERSION = '1.15.0';
export const ATLAS_PACKAGE = `@dogfood-lab/atlas@${ATLAS_VERSION}`;

// A committed map is a few megabytes on a large repository; the swarm's other
// repo-tree reads are capped for the same reason (lib/bounded-json-read.js).
const ATLAS_JSON_MAX_BYTES = 64 * 1024 * 1024;

const BOUNDARY_FILE = 'atlas/boundaries.yaml';
const STRUCTURE_FILE = 'atlas/structure.json';
const PAGE_FILE = 'atlas/page.json';

/**
 * Whether a repository adopted Atlas, and its committed map when it did.
 *
 * `adopted` follows the boundary file alone, because that is what adopting
 * means; a boundary file with no readable map is adopted-but-unmapped and
 * `problem` says what to run.
 *
 * @param {string} repoPath
 * @returns {{ adopted: boolean, structure: object|null, page: object|null, problem: string|null }}
 */
export function readAtlasMap(repoPath) {
  if (!repoPath || !existsSync(join(repoPath, BOUNDARY_FILE))) {
    return { adopted: false, structure: null, page: null, problem: null };
  }
  const structure = readMapJson(repoPath, STRUCTURE_FILE);
  if (structure.problem) return { adopted: true, structure: null, page: null, problem: structure.problem };
  if (!Array.isArray(structure.value?.boundaries)) {
    return {
      adopted: true, structure: null, page: null,
      problem: `${STRUCTURE_FILE} has no boundaries list; run \`npx --yes ${ATLAS_PACKAGE} map\` and commit atlas/`,
    };
  }
  // The page is optional here: the domain map needs only the structure, and a
  // brief without "What breaks what" rows still carries the entry points.
  const page = readMapJson(repoPath, PAGE_FILE);
  return { adopted: true, structure: structure.value, page: page.value ?? null, problem: null };
}

function readMapJson(repoPath, rel) {
  const path = join(repoPath, rel);
  if (!existsSync(path)) {
    return { problem: `${rel} is absent; run \`npx --yes ${ATLAS_PACKAGE} map\` and commit atlas/` };
  }
  try {
    return { value: readBoundedJson(path, { maxBytes: ATLAS_JSON_MAX_BYTES }) };
  } catch (err) {
    return { problem: `${rel} could not be read (${err.message}); run \`npx --yes ${ATLAS_PACKAGE} map\`` };
  }
}

/** The commit a committed map was generated from, or null. */
export function mapCommitOf(structure, page) {
  return page?.commit ?? structure?.generatedFrom?.commit ?? null;
}

/**
 * Every path git tracks in `repoPath`, forward-slashed. The population the
 * domain map must cover is enumerated from git itself, not from the map, so a
 * stale map cannot vouch for its own coverage.
 */
export function listTrackedFiles(repoPath) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoPath, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/'));
}

let resolvedCli = null;

/**
 * The path of the pinned Atlas CLI in the npx cache, fetched once per process.
 *
 * npx runs from the temp directory, not the repository: inside a repository
 * whose workspace declares `@dogfood-lab/atlas` (this monorepo), npx resolves
 * the workspace package instead of the pinned one and fails when its bin is
 * not linked. The script it runs finds the package beside a `.bin` directory
 * on PATH and checks the version, so a different Atlas on PATH is never taken
 * for the pinned one. Every later call runs that file under this Node, with no
 * shell, so a path read from the map is passed as one argument, never parsed.
 *
 * @returns {{ cli: string|null, problem: string|null }}
 */
export function resolvePinnedAtlasCli() {
  if (resolvedCli) return { cli: resolvedCli, problem: null };
  const script = "const {existsSync}=require('fs');const {join,delimiter}=require('path');" +
    "for(const d of (process.env.PATH||'').split(delimiter)){const c=join(d,'..','@dogfood-lab','atlas');" +
    "const f=join(c,'package.json');if(existsSync(f)&&require(f).version===process.argv[1])" +
    "{process.stdout.write(join(c,'cli.js'));break}}";
  const args = ['--yes', '--prefer-offline', `--package=${ATLAS_PACKAGE}`, '--', 'node', '-e', script, ATLAS_VERSION];
  // npx is a .cmd shim on Windows, which Node spawns only through a shell. The
  // arguments here are constants; the quoting keeps cmd.exe from reading the
  // script's parentheses and pipes.
  const win = process.platform === 'win32';
  const result = spawnSync('npx', win ? args.map((a) => (/[\s"'()&|<>^;,]/.test(a) ? `"${a}"` : a)) : args, {
    cwd: tmpdir(), encoding: 'utf-8', shell: win, timeout: 5 * 60 * 1000,
  });
  const cli = (result.stdout ?? '').trim();
  if (result.status !== 0 || !cli || !existsSync(cli)) {
    const why = (result.stderr || result.error?.message || `exit ${result.status}`).trim().split(/\r?\n/).slice(-3).join(' ');
    return { cli: null, problem: `could not fetch ${ATLAS_PACKAGE} with npx (${why})` };
  }
  resolvedCli = cli;
  return { cli, problem: null };
}

/**
 * Run the Atlas command line in `cwd`.
 *
 * @param {string[]} args
 * @param {{ cwd: string, timeoutMs?: number, cli?: string }} opts — `cli`
 *   names an Atlas CLI file to run instead of the pinned package; the tests
 *   pass the workspace one
 * @returns {{ status: number|null, stdout: string, stderr: string, command: string }}
 */
export function runAtlas(args, opts) {
  let cli = opts.cli ?? null;
  if (!cli) {
    const pinned = resolvePinnedAtlasCli();
    if (!pinned.cli) return { status: null, stdout: '', stderr: pinned.problem, command: `atlas ${args.join(' ')}` };
    cli = pinned.cli;
  }
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: opts.cwd, encoding: 'utf-8', timeout: opts.timeoutMs ?? 5 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr || (result.error ? String(result.error.message) : ''),
    command: opts.cli ? `atlas ${args.join(' ')} (${opts.cli})` : `npx --yes ${ATLAS_PACKAGE} ${args.join(' ')}`,
  };
}

// ── Lineage, kept in the kv table so no schema migration is needed (the
// same mechanism as `wave:<id>:skip_verify` and `roadmap_seed:<run-id>`).

export const ATLAS_LINEAGE_KV_PREFIX = 'atlas_map:';

export function readAtlasLineage(db, runId) {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(ATLAS_LINEAGE_KV_PREFIX + runId);
  if (!row?.value) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

export function writeAtlasLineage(db, runId, lineage) {
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)')
    .run(ATLAS_LINEAGE_KV_PREFIX + runId, JSON.stringify(lineage));
}
