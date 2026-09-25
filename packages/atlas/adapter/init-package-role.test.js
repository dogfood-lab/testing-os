import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { parse } from 'yaml';

// fixtures/atlas/package-role, read by atlas init: a package directory with
// workflows of its own (see the fixture's README).

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/package-role');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a package directory that carries its own workflows', () => {
  it('is code', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-package-role-'));
    roots.push(root);
    cpSync(FIXTURE, root, { recursive: true });
    const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    git(['init']);
    git(['config', 'core.autocrlf', 'false']);
    git(['add', '-A']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'package-role']);
    const result = spawnSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const boundaries = parse(readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries;
    assert.equal(boundaries.find((boundary) => boundary.globs.includes('tools/assist/**'))?.role, 'code', JSON.stringify(boundaries));
  });
});
