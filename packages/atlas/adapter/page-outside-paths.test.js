import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/outside-paths: a research script that requires a build by a
// drive-letter path, a home-directory path, an absolute POSIX path and a
// sibling checkout, beside one import of its own. The test adds a script that
// requires a file by this machine's absolute path, and maps the copy twice:
// with every one of those outside files on disk, and with none.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/outside-paths');
const roots = [];
let base;
let root;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function map() {
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  return {
    bytes: readFileSync(join(root, 'atlas', 'structure.json')),
    limits: JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')).limits,
  };
}

function plant(path) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, 'module.exports = {};\n');
}

before(() => {
  base = mkdtempSync(join(tmpdir(), 'atlas-outside-'));
  roots.push(base);
  root = join(base, 'repo');
  cpSync(FIXTURE, root, { recursive: true });
  const machine = join(base, 'outside', 'dist', 'index.js').replaceAll('\\', '/');
  writeFileSync(join(root, 'research', 'machine.cjs'), `module.exports = require(${JSON.stringify(machine)});\n`);
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'outside-paths']);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('an import that names a path outside the repository', () => {
  it('maps to the same bytes whether or not the outside files exist on this machine', () => {
    plant(join(base, 'outside', 'dist', 'index.js'));
    plant(join(base, 'synthesis', 'dist', 'index.js'));
    const present = map();
    rmSync(join(base, 'outside'), { recursive: true, force: true });
    rmSync(join(base, 'synthesis'), { recursive: true, force: true });
    const absent = map();
    assert.equal(Buffer.compare(present.bytes, absent.bytes), 0, `${present.bytes}\n----\n${absent.bytes}`);
  });

  it('counts every such site apart, reads none of them from disk, and keeps the import of its own', () => {
    const { bytes, limits } = map();
    const research = JSON.parse(bytes.toString('utf8')).boundaries.find((boundary) => boundary.name === 'research');
    assert.equal(research.outsideImports, 5);
    assert.equal(research.unresolvedSites, 0);
    const probe = research.files.find((file) => file.path === 'research/probe.cjs');
    assert.deepEqual(probe.importsFiles, ['research/local.cjs']);
    assert.ok(limits.includes('5 import sites name a path outside this repository, so what they load is not followed.'), limits.join('\n'));
  });
});
