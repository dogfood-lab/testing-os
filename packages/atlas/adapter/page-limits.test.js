import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { unreadLine } from './page.js';

// fixtures/atlas/limits-split: a tool that builds one command at run time
// and a test that builds two, two fixtures broken on purpose, and one schema
// the parser stops on at a NUL character.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/limits-split');
const roots = [];
let structure;
let limits;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-limits-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'limits-split']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  limits = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')).limits;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what the map cannot see, told apart by where it lives', () => {
  it('says how many of the commands built at run time are in tests', () => {
    const part = (name) => structure.boundaries.find((boundary) => boundary.name === name);
    assert.equal(part('tests').dynamicSpawns, 2);
    assert.equal(part('tests').dynamicSpawnsInTests, 2);
    assert.equal(part('tools').dynamicSpawns, 1);
    assert.equal(part('tools').dynamicSpawnsInTests, 0);
    assert.ok(limits.includes('3 commands are built at run time and not followed, 2 of them in tests.'), limits.join('\n'));
  });

  it('groups the files the parser cannot read by part when a part holds more than one', () => {
    assert.ok(
      limits.includes('3 files use syntax the parser cannot read, so what they import is not known: 2 in fixtures, 1 in schemas (a NUL character inside a string).'),
      limits.join('\n'),
    );
  });

  it('names the part once when every such file is in it, and keeps the construct counts when no part holds two', () => {
    const inLib = [{ part: 'lib', unreadSyntax: 'nul-character' }, { part: 'lib', unreadSyntax: 'nul-character' }, { part: 'lib' }];
    assert.equal(
      unreadLine(inLib),
      '3 files in lib use syntax the parser cannot read, so what they import is not known: a NUL character inside a string (2) and other syntax (1).',
    );
    const apart = [{ part: 'a', unreadSyntax: 'nul-character' }, { part: 'b' }];
    assert.equal(
      unreadLine(apart),
      '2 files use syntax the parser cannot read, so what they import is not known: a NUL character inside a string (1) and other syntax (1).',
    );
  });
});
