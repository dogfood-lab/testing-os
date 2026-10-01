import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository, PARSE_COUNTS } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { readBoundaryFile } from './boundary-file.js';
import { compareArtifacts } from './check.js';
import { checkCommand } from './commands.js';
import { initCommand } from './init.js';

// atlas check compares the structure (the parts and their files, the edges,
// the entries, the unresolved sites) and reports the workflows' door checks.
// It read every file for the page as well, the order of its calls and its
// writes and reads among them, which is more than half of what a file costs.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function mappedHost() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-check-cost-'));
  roots.push(root);
  cpSync(join(FIXTURES, 'host'), root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'host']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  git(root, ['add', 'atlas']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'map']);
  return root;
}

// A part for each directory at the top of the tree, so the edges between
// them are compared too.
function topDirectories(root) {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).stdout.split('\0');
  return [...new Set(listed.filter((path) => path.includes('/')).map((path) => path.slice(0, path.indexOf('/'))))].sort();
}

// What a command prints, kept from the test runner's own output.
function quietly(run) {
  const write = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => {
    out += String(chunk);
    return true;
  };
  try {
    return { code: run(), out };
  } finally {
    process.stdout.write = write;
  }
}

// What atlas check compares, and the findings it reports.
function compared(artifact) {
  return {
    boundaries: artifact.boundaries.map((part) => ({
      name: part.name,
      role: part.role,
      globs: part.globs,
      importConfidence: part.importConfidence,
      entryPoints: part.entryPoints,
      unresolvedSites: part.unresolvedSites,
      files: part.files.map((file) => [file.path, file.hash]),
    })),
    edges: artifact.edges.map((edge) => [edge.from, edge.to, edge.kind, edge.fromTests === true]),
    unassigned: artifact.unassigned.map((file) => [file.path, file.hash]),
    overlaps: artifact.overlaps.map((file) => [file.path, file.hash, file.boundaries]),
    submodules: artifact.submodules,
    findings: (artifact.doors ?? []).filter((door) => (door.findings ?? []).length > 0).map((door) => [door.file, door.name, door.findings]),
  };
}

describe('the cost of atlas check', () => {
  it('reads each file for what it compares, never for the order of its calls', () => {
    const root = mappedHost();
    const before = { ...PARSE_COUNTS };
    const { code, out } = quietly(() => checkCommand(root));
    assert.equal(code, 0, out);
    assert.match(out, /boundaries match the committed map/);
    assert.ok(PARSE_COUNTS.files > before.files, 'the check parsed the tree');
    assert.equal(PARSE_COUNTS.sequences, before.sequences, 'and read no file for the order of its calls');
  });

  // The fixtures whose maps carry what the check compares through the
  // readings it keeps: imports and their resolution, spawns, HTTP routes,
  // bundler calls, build outputs, workspace members, Rust and Godot, and
  // workflows whose door checks find something.
  const FIXTURE_NAMES = [
    'build-output', 'bundled-builds', 'cli-entry', 'door-lockfile', 'door-runtime', 'door-toolchain', 'doors', 'doors-py', 'doors-ts',
    'exports-and-api', 'godot-project', 'rust-imports', 'spawn-helpers', 'spawned-parts', 'turbo-runs', 'unseen-apps',
  ];
  for (const name of FIXTURE_NAMES) {
    it(`compares ${name} as a whole map does`, () => {
      const root = makeRepo(join(FIXTURES, name));
      roots.push(root);
      const read = readBoundaryFile(root);
      const boundaries = read.ok
        ? read.boundaries.map((part) => ({ name: part.name, globs: part.globs, role: part.role }))
        : topDirectories(root).map((dir) => ({ name: dir, globs: [`${dir}/**`], role: 'code' })).concat({ name: 'root', globs: ['*'], role: 'config' });
      const whole = buildArtifact(mapRepository({ repoPath: root, boundaries }), 'commit');
      const structure = buildArtifact(mapRepository({ repoPath: root, boundaries, structureOnly: true }), 'commit');
      assert.deepEqual(compared(structure), compared(whole));
      assert.equal(compareArtifacts(whole, structure, root), null);
    });
  }
});

describe('the cost of atlas init', () => {
  // A proposal is each part's files, entries and manifest, which is the
  // structure the check reads; init read the tree for the page as well.
  it('reads each file for the structure, never for the order of its calls', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-init-cost-'));
    roots.push(root);
    cpSync(join(FIXTURES, 'host'), root, { recursive: true });
    rmSync(join(root, 'atlas'), { recursive: true, force: true });
    git(root, ['init', '-q']);
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'host']);
    const before = { ...PARSE_COUNTS };
    const { code, out } = quietly(() => initCommand(root, []));
    assert.equal(code, 0, out);
    assert.match(out, /wrote atlas\/boundaries\.yaml/);
    assert.ok(PARSE_COUNTS.files > before.files, 'init parsed the tree');
    assert.equal(PARSE_COUNTS.sequences, before.sequences, 'and read no file for the order of its calls');
  });
});
