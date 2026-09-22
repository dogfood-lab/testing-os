import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function scratch() {
  const path = mkdtempSync(join(tmpdir(), 'atlas-ladder-'));
  roots.push(path);
  return path;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function repoWith(files) {
  const root = scratch();
  for (const [path, text] of Object.entries(files)) write(join(root, path), text);
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'tree']);
  return root;
}

const PKG = {
  'pkg/package.json': `${JSON.stringify({ name: 'pkg', main: './index.js' }, null, 2)}\n`,
  'pkg/index.js': 'export const value = 1;\n',
};

function yaml(boundary) {
  const lines = ['summary: ""', 'boundaries:', '  - name: pkg', '    globs:', '      - pkg/**'];
  for (const [key, value] of Object.entries(boundary)) {
    lines.push(`    ${key}: ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

function mapped(root, boundary) {
  write(join(root, 'atlas', 'boundaries.yaml'), yaml(boundary));
  git(root, ['add', '-A']);
  const result = atlas(root, ['map']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  git(root, ['add', 'atlas']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'map']);
  return atlas(root, ['check']);
}

describe('acceptance ladder', () => {
  it('fails an accepted boundary whose fields are still derived', () => {
    const root = repoWith(PKG);
    const result = mapped(root, {
      status: 'accepted',
      role: 'code',
      reason: 'because the package exists',
      why_from: 'derived',
      will_break: 'callers notice',
      will_break_from: 'derived',
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /ATLAS_ACCEPTED_UNAUTHORED/);
    assert.match(result.stdout, /why_from is derived/);
    assert.match(result.stdout, /will_break_from is derived/);
  });

  it('fails when a human flag is left on the derived sentence, and passes once the sentence changes', () => {
    const root = repoWith(PKG);
    assert.equal(atlas(root, ['init']).status, 0);
    const derived = readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8');
    const stamped = derived.replaceAll('status: proposed', 'status: accepted').replaceAll(': derived', ': human');
    write(join(root, 'atlas', 'boundaries.yaml'), stamped);
    git(root, ['add', 'atlas/boundaries.yaml']);
    assert.equal(atlas(root, ['map']).status, 0);
    git(root, ['add', 'atlas/structure.json']);
    git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'stamp']);
    const rubber = atlas(root, ['check']);
    assert.equal(rubber.status, 1, rubber.stdout);
    assert.match(rubber.stdout, /ATLAS_ACCEPTED_UNAUTHORED/);
    assert.match(rubber.stdout, /reason still matches the derived sentence/);
    assert.match(rubber.stdout, /will_break still matches the derived sentence/);
    const edited = stamped
      .replace(/reason: .*/, 'reason: this package is the one a caller imports')
      .replace(/will_break: .*/, 'will_break: a caller that imported the old shape fails to compile');
    write(join(root, 'atlas', 'boundaries.yaml'), edited);
    const passed = atlas(root, ['check']);
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  });

  it('requires start_here only when nothing was derived, and lets a derived entry point stand', () => {
    const bare = repoWith({ 'notes/readme.txt': 'hello\n' });
    const missing = mapped(bare, {
      status: 'accepted',
      role: 'docs',
      reason: 'notes that are not the package',
      why_from: 'human',
      will_break: 'nobody imports this',
      will_break_from: 'human',
    });
    // The glob in yaml() is pkg/**, so rewrite it for this tree.
    write(join(bare, 'atlas', 'boundaries.yaml'), readFileSync(join(bare, 'atlas', 'boundaries.yaml'), 'utf8').replaceAll('pkg/**', 'notes/**').replaceAll('name: pkg', 'name: notes'));
    git(bare, ['add', 'atlas/boundaries.yaml']);
    assert.equal(atlas(bare, ['map']).status, 0);
    git(bare, ['add', 'atlas/structure.json']);
    git(bare, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'remap']);
    const noEntry = atlas(bare, ['check']);
    assert.equal(noEntry.status, 1, noEntry.stdout);
    assert.match(noEntry.stdout, /start_here is empty and no entry point was derived/);

    const rooted = repoWith(PKG);
    const present = mapped(rooted, {
      status: 'accepted',
      role: 'code',
      reason: 'this package is the one a caller imports',
      why_from: 'human',
      will_break: 'a caller that imported the old shape fails to compile',
      will_break_from: 'human',
    });
    assert.equal(present.status, 0, present.stdout + present.stderr);
  });

  it('requires a reason to defer and nothing else, and lets a proposed boundary stay empty', () => {
    const root = repoWith(PKG);
    const deferred = mapped(root, { status: 'deferred', role: 'code' });
    assert.equal(deferred.status, 1);
    assert.match(deferred.stdout, /ATLAS_DEFERRED_WITHOUT_REASON/);
    write(join(root, 'atlas', 'boundaries.yaml'), `${readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8')}    reason: waiting on the split\n`);
    const withReason = atlas(root, ['check']);
    assert.equal(withReason.status, 0, withReason.stdout + withReason.stderr);

    const proposed = repoWith(PKG);
    const empty = mapped(proposed, { status: 'proposed', role: 'code' });
    assert.equal(empty.status, 0, empty.stdout + empty.stderr);
  });
});
