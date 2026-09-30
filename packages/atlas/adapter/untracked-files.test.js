import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ERRORS } from './errors.js';

/**
 * atlas map reads the tracked tree, so the map is the same on every clone. A
 * file in the working tree that git does not track is left out of it, and
 * map says so (docs/atlas-production.spec.md, Part 6): a flow that writes
 * files and maps before staging them would otherwise get a map without them
 * and no word of it. A file .gitignore covers is left out by design and not
 * named. The warning goes to stderr, so stdout stays what a caller parses.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/untracked-files');
const MAP_FILES = ['structure.json', 'statistics.json', 'README.md', 'page.json'];
const roots = [];

let root;
let clean;
let clutteredRun;
let cluttered;

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function map() {
  return spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
}

// The map's only clock-bound text is the date it was made (see
// determinism.test.js); everything else must match byte for byte.
function settle(text) {
  return text
    .replace(/^Mapped at \S+ from/m, 'Mapped at DATE from')
    .replace(/"generatedAt": "[^"]*"/g, '"generatedAt": "STAMP"');
}

function readMap() {
  return MAP_FILES.map((name) => readFileSync(join(root, 'atlas', name), 'utf8'));
}

function write(path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-untracked-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(['init']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '-A']);
  git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'fixture']);
  const first = map();
  assert.equal(first.status, 0, first.stdout + first.stderr);
  clean = readMap();
  write('scripts/extra.js', "import './run.js';\n");
  write('notes/draft.md', '# a draft\n');
  write('out/ignored.js', 'export const ignored = 1;\n');
  clutteredRun = map();
  cluttered = readMap();
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas map with files git does not track', () => {
  it('has a code in the error table', () => {
    assert.equal(ERRORS.ATLAS_MAP_UNTRACKED, 'The working tree holds files git does not track, which the map leaves out.');
  });

  it('exits 0 and warns on stderr, naming the untracked files outside .gitignore and no ignored one', () => {
    assert.equal(clutteredRun.status, 0, clutteredRun.stdout + clutteredRun.stderr);
    const lines = clutteredRun.stderr.trimEnd().split('\n');
    assert.deepEqual(lines, [
      'ATLAS_MAP_UNTRACKED  The working tree holds files git does not track, which the map leaves out.',
      '  what changed:   2 untracked files outside .gitignore: notes/draft.md and scripts/extra.js',
      '  what to do:     git add the files the map should hold and run atlas map again, or add them to .gitignore',
    ]);
    assert.ok(!clutteredRun.stderr.includes('out/ignored.js'));
  });

  it('keeps stdout free of the warning', () => {
    assert.ok(!clutteredRun.stdout.includes('ATLAS_MAP_UNTRACKED'));
    assert.match(clutteredRun.stdout, /^atlas map\n/);
  });

  it('writes the same map as the same tree with no untracked file', () => {
    for (let i = 0; i < MAP_FILES.length; i += 1) assert.equal(settle(cluttered[i]), settle(clean[i]), MAP_FILES[i]);
    assert.equal(cluttered[0], clean[0], 'structure.json byte for byte');
  });

  it('says nothing about the map it writes itself, nor when nothing is untracked', () => {
    // The first map wrote atlas/ into a tree that did not track it.
    rmSync(join(root, 'scripts', 'extra.js'));
    rmSync(join(root, 'notes'), { recursive: true });
    const quiet = map();
    assert.equal(quiet.status, 0);
    assert.equal(quiet.stderr, '');
  });

  it('names the first five and counts the rest', () => {
    for (let i = 0; i < 7; i += 1) write(`scripts/new${i}.js`, 'export {};\n');
    const many = map();
    assert.equal(many.status, 0);
    assert.match(many.stderr, /^ {2}what changed: {3}7 untracked files outside \.gitignore: scripts\/new0\.js, scripts\/new1\.js, scripts\/new2\.js, scripts\/new3\.js, scripts\/new4\.js and 2 more$/m);
    for (let i = 0; i < 7; i += 1) rmSync(join(root, 'scripts', `new${i}.js`));
  });
});
