import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';

// fixtures/atlas/data-roles, read by atlas init: parts of images, JSON Lines,
// JSON schemas and YAML world data, a part of tool settings, a part of shell
// scripts, and one of code.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/data-roles');
const roots = [];
let roles;
let root;

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-data-roles-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(['init']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '-A']);
  git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'data-roles']);
  const result = spawnSync(process.execPath, [CLI, 'init'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const file = parse(readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8'));
  roles = Object.fromEntries(file.boundaries.map((boundary) => [boundary.name, boundary.role]));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the role of a part', () => {
  it('is data for a part of images, JSON Lines, schemas or world data with no manifest', () => {
    assert.deepEqual([roles.logos, roles.records, roles.schemas, roles.world], ['data', 'data', 'data', 'data']);
  });

  it('stays config for the settings files tools read', () => {
    assert.equal(roles.config, 'config');
  });

  it('is code for a part of shell scripts', () => {
    assert.equal(roles.scripts, 'code');
    assert.equal(roles.src, 'code');
  });

  it('is kept by the map, and no test is expected of data', () => {
    const map = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(map.status, 0, map.stdout + map.stderr);
    const page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
    assert.ok(page.untested.every((item) => !['logos', 'records', 'schemas', 'world'].includes(item.part)), JSON.stringify(page.untested));
  });
});
