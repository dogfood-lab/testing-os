import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { readBoundaryFile } from './boundary-file.js';

// fixtures/atlas/init-shapes: one repository per shape init used to leave
// files in no part (see its README).

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const SHAPES = resolve(import.meta.dirname, '../../../fixtures/atlas/init-shapes');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

// atlas init on a copy of one shape, with the files named left out.
function init(shape, { without = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-init-shape-'));
  roots.push(root);
  cpSync(join(SHAPES, shape), root, { recursive: true });
  for (const path of without) rmSync(join(root, path));
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', shape]);
  const result = spawnSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const doc = readBoundaryFile(root);
  assert.equal(doc.ok, true, doc.details?.join('\n'));
  return { stdout: result.stdout, parts: Object.fromEntries(doc.boundaries.map((boundary) => [boundary.name, { globs: boundary.globs, role: boundary.role }])) };
}

function assertAllAssigned(stdout) {
  assert.match(stdout, /\nunassigned {2}0 files\n/, stdout);
  assert.doesNotMatch(stdout, /\noverlaps /, stdout);
}

describe('atlas init leaves no tracked file in no part', () => {
  it('keeps a part for what a directory holds beside the crates split out of it', () => {
    const { stdout, parts } = init('nested-crates');
    assertAllAssigned(stdout);
    assert.deepEqual(parts.kb.globs, ['kb/*', 'kb/catalog/**', 'kb/scripts/**']);
    assert.deepEqual(parts.oracle.globs, ['kb/oracle/**']);
    assert.deepEqual(parts['oracle-jam'].globs, ['kb/oracle-jam/**']);
  });

  it('makes a directory beside a package in packages/ a part of its own, manifest or not', () => {
    const { stdout, parts } = init('project-home');
    assertAllAssigned(stdout);
    assert.deepEqual(parts.bridge, { globs: ['packages/bridge/**'], role: 'code' });
    assert.deepEqual(parts.core.globs, ['packages/core/**']);
  });

  it('makes each seed of a workspace one part with its site, and keeps a part for the files beside the seeds', () => {
    const { stdout, parts } = init('seed-workspace');
    assertAllAssigned(stdout);
    assert.deepEqual(Object.keys(parts).sort(), ['alpha', 'beta', 'gamma', 'packages', 'root']);
    // A seed is its source, not the site it carries beside it, nor the
    // workflows of the repository it came from.
    assert.deepEqual(parts.alpha, { globs: ['packages/alpha/**'], role: 'code' });
    assert.deepEqual(parts.beta, { globs: ['packages/beta/**'], role: 'code' });
    assert.deepEqual(parts.gamma, { globs: ['packages/gamma/**'], role: 'code' });
    assert.deepEqual(parts.packages.globs, ['packages/*']);
  });

  it('makes each seed a part with no workspace file, its nested projects split out of it', () => {
    const { stdout, parts } = init('seed-workspace', { without: ['pnpm-workspace.yaml'] });
    assertAllAssigned(stdout);
    assert.deepEqual(parts.alpha.globs, ['packages/alpha/*', 'packages/alpha/src/**']);
    assert.deepEqual(parts['packages/alpha/site'].globs, ['packages/alpha/site/**']);
    assert.deepEqual(parts.beta.globs, ['packages/beta/*', 'packages/beta/.github/**']);
    assert.deepEqual(parts.Beta, { globs: ['packages/beta/src/Beta/**'], role: 'code' });
  });

  it('makes each .csproj project in src/ a part with role code, and keeps a part for src/ itself', () => {
    const { stdout, parts } = init('dotnet-projects');
    assertAllAssigned(stdout);
    assert.deepEqual(parts['Ledger.App'], { globs: ['src/Ledger.App/**'], role: 'code' });
    assert.deepEqual(parts['Ledger.Core'], { globs: ['src/Ledger.Core/**'], role: 'code' });
    assert.deepEqual(parts.src.globs, ['src/*']);
    assert.deepEqual(parts.tests.globs, ['tests/**']);
  });
});
