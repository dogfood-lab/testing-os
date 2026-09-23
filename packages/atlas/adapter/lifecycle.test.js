import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const HOST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/host');
const roots = [];
let golden;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function scratch() {
  const path = mkdtempSync(join(tmpdir(), 'atlas-host-'));
  roots.push(path);
  return path;
}

function cloneOf(depth) {
  const dest = scratch();
  const args = ['clone'];
  if (depth) args.push('--depth', String(depth));
  args.push(golden, dest);
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return dest;
}

describe('atlas check lifecycle', () => {
  before(() => {
    golden = scratch();
    cpSync(HOST, golden, { recursive: true });
    git(golden, ['init']);
    git(golden, ['config', 'core.autocrlf', 'false']);
    git(golden, ['add', '-A']);
    git(golden, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'host']);
    const mapped = atlas(golden, ['map']);
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    git(golden, ['add', 'atlas/structure.json']);
    git(golden, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'map']);
  });

  after(() => {
    while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
  });

  it('passes with no mutation', () => {
    const result = atlas(cloneOf(), ['check']);
    assert.equal(result.status, 0, result.stdout);
  });

  it('passes with a notice when atlas/ is removed', () => {
    const dest = cloneOf();
    rmSync(join(dest, 'atlas'), { recursive: true, force: true });
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /no atlas\/ directory/);
  });

  it('fails ATLAS_NOT_MAPPED when only the artifact is removed', () => {
    const dest = cloneOf();
    rmSync(join(dest, 'atlas', 'structure.json'));
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_NOT_MAPPED/);
  });

  it('passes when a new file lands inside an existing glob', () => {
    const dest = cloneOf();
    writeFileSync(join(dest, 'pkg', 'alpha', 'fresh.js'), 'export const fresh = 1;\n');
    git(dest, ['add', 'pkg/alpha/fresh.js']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 0, result.stdout);
  });

  it('fails ATLAS_UNASSIGNED_NEW when a new unowned file appears', () => {
    const dest = cloneOf();
    writeFileSync(join(dest, 'notes', 'brand-new.txt'), 'a file nobody claimed\n');
    git(dest, ['add', 'notes/brand-new.txt']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_UNASSIGNED_NEW/);
    assert.match(result.stdout, /notes\/brand-new.txt/);
  });

  it('treats a rename of the large unowned file as the same file', () => {
    const dest = cloneOf();
    git(dest, ['mv', 'notes/unowned-large.txt', 'notes/renamed-large.txt']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 0, result.stdout);
  });

  it('fails ATLAS_UNASSIGNED_NEW when the small unowned file is renamed', () => {
    const dest = cloneOf();
    git(dest, ['mv', 'notes/unowned-small.txt', 'notes/renamed-small.txt']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_UNASSIGNED_NEW/);
    assert.match(result.stdout, /notes\/renamed-small.txt/);
  });

  it('passes when an unowned file disappears', () => {
    const dest = cloneOf();
    git(dest, ['rm', 'notes/unowned-small.txt']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 0, result.stdout);
  });

  it('fails ATLAS_FILE_MOVED when a large rostered file changes boundary', () => {
    const dest = cloneOf();
    git(dest, ['mv', 'pkg/alpha/heavy.js', 'pkg/beta/heavy.js']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_FILE_MOVED/);
    assert.match(result.stdout, /pkg\/beta\/heavy.js was in alpha and is in beta/);
  });

  it('fails ATLAS_STRUCTURE_DRIFT when a new inter-boundary edge appears', () => {
    const dest = cloneOf();
    writeFileSync(join(dest, 'pkg', 'alpha', 'index.js'), "import './util.js';\nimport '../beta/index.js';\nexport const alpha = 1;\n");
    git(dest, ['add', 'pkg/alpha/index.js']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_STRUCTURE_DRIFT/);
    assert.match(result.stdout, /alpha → beta \(file\)/);
  });

  it('passes when another import follows an edge that already exists', () => {
    const dest = cloneOf();
    writeFileSync(join(dest, 'tests', 'more.test.js'), "import '../pkg/beta/index.js';\n");
    git(dest, ['add', 'tests/more.test.js']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 0, result.stdout);
  });

  it('fails ATLAS_BOUNDARY_EMPTY when a boundary loses every file', () => {
    const dest = cloneOf();
    git(dest, ['rm', '-r', 'pkg/alpha']);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_BOUNDARY_EMPTY/);
    assert.match(result.stdout, /alpha matches no files/);
  });

  it('fails ATLAS_OVERLAP when two globs claim one file', () => {
    const dest = cloneOf();
    writeFileSync(
      join(dest, 'atlas', 'boundaries.yaml'),
      readFileSync(join(dest, 'atlas', 'boundaries.yaml'), 'utf8').replace(
        '      - pkg/alpha/**\n',
        '      - pkg/alpha/**\n      - pkg/beta/**\n',
      ),
    );
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_OVERLAP/);
    assert.match(result.stdout, /pkg\/beta\/index.js is in alpha and beta/);
  });

  it('fails ATLAS_STRUCTURE_DRIFT when a committed role is edited', () => {
    const dest = cloneOf();
    const path = join(dest, 'atlas', 'structure.json');
    const artifact = JSON.parse(readFileSync(path, 'utf8'));
    artifact.boundaries.find((boundary) => boundary.name === 'tests').role = 'docs';
    writeFileSync(path, JSON.stringify(artifact, null, 2));
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_STRUCTURE_DRIFT/);
    assert.match(result.stdout, /tests role is test; the committed map says docs/);
  });

  it('passes in a depth-one clone', () => {
    const dest = cloneOf(1);
    const result = atlas(dest, ['check']);
    assert.equal(result.status, 0, result.stdout);
  });
});

