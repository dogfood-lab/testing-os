import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/explain-manifest: a CLI that reads its version from
// package.json and imports one file (see the fixture's README).

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/explain-manifest');
const roots = [];
let root;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-explain-manifest-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'fixture']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what explain says a file imports and reads', () => {
  it('lists a manifest the file loads under Reads, never under Imports', () => {
    const result = spawnSync(process.execPath, [CLI, 'explain', 'src/cli.js'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const lines = result.stdout.trimEnd().split('\n');
    assert.ok(lines.includes('Imports 1 file: src/run.js.'), lines.join('\n'));
    assert.ok(lines.includes('Reads package.json.'), lines.join('\n'));
  });

  it('names no importer of the manifest', () => {
    const result = spawnSync(process.execPath, [CLI, 'explain', 'package.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.stdout.split('\n').includes('No file imports it.'), result.stdout);
  });
});
