import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { parse } from 'yaml';

// fixtures/atlas/json-projects, read by atlas init: a directory of projects
// kept as JSON, one with a script beside its data (see the fixture's README).

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/json-projects');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a directory of JSON projects', () => {
  it('is data, though a script sits beside the data', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-json-projects-'));
    roots.push(root);
    cpSync(FIXTURE, root, { recursive: true });
    const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    git(['init']);
    git(['config', 'core.autocrlf', 'false']);
    git(['add', '-A']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'json-projects']);
    const result = spawnSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const roles = Object.fromEntries(parse(readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries.map((boundary) => [boundary.name, boundary.role]));
    assert.equal(roles.projects, 'data');
    assert.equal(roles.src, 'code');
  });
});
