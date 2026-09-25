import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildPage } from './page.js';

// fixtures/atlas/checked-runs: CI lints the whole tree with eslint, runs the
// test suite, and runs one gate script. tools/replay.mjs is linted and never
// run; it writes a receipt beside itself when a person runs it.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/checked-runs');
const roots = [];
let root;
let structure;
let markdown;
let json;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).split('\n');
}

function has(heading, sentence) {
  assert.ok(section(heading).includes(sentence), `${heading}: ${sentence}\n${section(heading).join('\n')}`);
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-checked-runs-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'checked-runs']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
  json = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a file a linter checks is not a file the door runs', () => {
  it('records each run as executed or checked', () => {
    const ci = structure.doors.find((door) => door.name === 'CI');
    assert.deepEqual(ci.runs.map((run) => [run.path, run.runKind]), [
      ['eslint.config.js', 'checks'],
      ['lib/', 'checks'],
      ['scripts/', 'checks'],
      ['scripts/gate.mjs', 'executes'],
      ['test/', 'executes'],
      ['tools/', 'checks'],
    ]);
    assert.equal(ci.checksCount, 4);
  });

  it('walks the reach from both, but credits the door only with what its executed files write', () => {
    const ci = structure.doors.find((door) => door.name === 'CI');
    assert.ok(ci.reach.some((entry) => entry.boundary === 'tools'), 'a checker does reach the code');
    assert.deepEqual(ci.landings, ['reports/gate.json']);
    has('## What happens through CI', '2. It writes to reports/gate.json.');
  });

  it('says what the door runs apart from what it checks', () => {
    has('## What comes in', '1. **CI.** On a push to main. Runs scripts/gate.mjs and test/; checks eslint.config.js, lib/, scripts/ and 1 more.');
    has('## What happens through CI', '1. The workflow runs scripts/gate.mjs in scripts and test/ in test; it checks lib/ in lib, eslint.config.js in the repository root, scripts/ in scripts and tools/ in tools.');
    const ci = json.doors.find((door) => door.name === 'CI');
    assert.deepEqual(ci.runs, ['scripts/gate.mjs', 'test/']);
    assert.deepEqual(ci.checks, ['eslint.config.js', 'lib/', 'scripts/', 'tools/']);
  });

  it('starts the reading path at a file the door runs', () => {
    assert.equal(section('## Where to start')[2], '.github/workflows/ci.yml → scripts/gate.mjs → lib/check.js');
  });

  it('names five parts a suite runs in, the one the commands name first, and counts the rest', () => {
    const parts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => ({
      files: [{ hash: name, path: `${name}/x.test.js` }, { hash: `${name}2`, path: `${name}/y.test.js` }],
      globs: [`${name}/**`],
      name,
      role: 'code',
    }));
    parts.push({ files: [{ hash: 's', path: 'scripts/gate.mjs' }], globs: ['scripts/**'], name: 'scripts', role: 'code' });
    const runs = [
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].flatMap((name) => [`${name}/x.test.js`, `${name}/y.test.js`]
        .map((path) => ({ job: 'test', matched: true, path, runKind: 'executes', via: 'vitest' }))),
      { job: 'test', path: 'scripts/gate.mjs', runKind: 'executes' },
    ];
    const ci = {
      file: '.github/workflows/ci.yml',
      landings: [],
      name: 'CI',
      reach: parts.map((part) => ({ boundary: part.name, depth: 0, files: part.files.length })),
      readers: [],
      runs,
      runsCount: runs.length,
      checksCount: 0,
      stages: [],
      triggers: [{ event: 'push' }],
    };
    const { markdown: page } = buildPage({ structure: { boundaries: parts, doors: [ci], edges: [], landings: [] }, statistics: {}, document: null, repoName: 'acme/suite' });
    assert.ok(page.includes('1. The workflow runs scripts/gate.mjs in scripts, a/x.test.js and a/y.test.js in a, b/x.test.js and b/y.test.js in b, c/x.test.js and c/y.test.js in c, d/x.test.js and d/y.test.js in d, and 6 files in 3 more parts.'), page);
    // The script the workflow names imports nothing and writes nothing, and
    // the tests import nothing either: a path never ends on a gate script,
    // so there is none to read.
    assert.ok(!page.includes('→ scripts/gate.mjs'), page);
    assert.ok(page.includes('CI runs no code this map can follow, so there is no path of files to read in order.'), page);
  });

  it('tells explain a file is checked, not run', () => {
    const explained = spawnSync(process.execPath, [CLI, 'explain', 'tools/replay.mjs'], { cwd: root, encoding: 'utf8' });
    assert.ok(explained.stdout.split('\n').includes('Checked by CI.'), explained.stdout);
  });
});
