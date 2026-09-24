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
// the parser stops on.

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

  it('groups the files the parser cannot read by part when a part holds more than one, and names them, production first', () => {
    assert.ok(
      limits.includes('3 files use syntax the parser cannot read (schemas/key.ts, fixtures/broken/a.ts and fixtures/broken/b.ts), so what they import is not known: 2 in fixtures, 1 in schemas.'),
      limits.join('\n'),
    );
  });

  it('names three of the files it cannot read and counts the rest', () => {
    const five = ['e.ts', 'a.ts', 'd.ts', 'b.ts', 'c.ts'].map((path) => ({ path, part: 'lib', unreadSyntax: 'jsx-ampersand' }));
    assert.equal(
      unreadLine(five),
      '5 files in lib use syntax the parser cannot read (a.ts, b.ts, c.ts and 2 more), so what they import is not known: a bare `&` in JSX text (5).',
    );
    assert.equal(
      unreadLine([{ path: 'src/kernel.ts', part: 'src' }]),
      '1 file uses syntax the parser cannot read (src/kernel.ts), so what it imports is not known.',
    );
  });

  it('names entry points, then production files, then tests and scripts', () => {
    const files = [
      { path: 'scripts/gen.mjs', part: 'scripts' },
      { path: 'test/unit.test.ts', part: 'test' },
      { path: 'src/util.ts', part: 'src' },
      { path: 'src/cli.ts', part: 'src', entry: true },
    ];
    assert.equal(
      unreadLine(files),
      '4 files use syntax the parser cannot read (src/cli.ts, src/util.ts, scripts/gen.mjs and 1 more), so what they import is not known: 2 in src, 1 in scripts, 1 in test.',
    );
  });

  it('names the part once when every such file is in it, and keeps the construct counts when no part holds two', () => {
    const inLib = [{ part: 'lib', unreadSyntax: 'jsx-ampersand' }, { part: 'lib', unreadSyntax: 'jsx-ampersand' }, { part: 'lib' }];
    assert.equal(
      unreadLine(inLib),
      '3 files in lib use syntax the parser cannot read, so what they import is not known: a bare `&` in JSX text (2) and other syntax (1).',
    );
    const apart = [{ part: 'a', unreadSyntax: 'jsx-ampersand' }, { part: 'b' }];
    assert.equal(
      unreadLine(apart),
      '2 files use syntax the parser cannot read, so what they import is not known: a bare `&` in JSX text (1) and other syntax (1).',
    );
  });
});
