import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildPage, mainDoor, orderDoors } from './page.js';

// fixtures/atlas/commands, mapped through the CLI: a repository whose
// manifests install three commands and a package, beside one workflow.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/commands');
const roots = [];
let root;
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
  root = mkdtempSync(join(tmpdir(), 'atlas-page-commands-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'commands']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
  json = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the commands a repository installs, on the page', () => {
  it('lists each command after the workflows, as a command people run', () => {
    has('## What comes in', '1. **CI.** On a push to main. Runs tests/.');
    has('## What comes in', '2. **kit** (a command people run). Runs packages/kit/cli.js.');
    has('## What comes in', '3. **tool** (a command people run). Runs bin/tool.mjs.');
    has('## What comes in', '5. **acme-py** (a command people run). Runs acmepy/cli.py.');
  });

  // No workflow here publishes @acme/tool, so it is the package's entry and
  // not a package people import (page-package-publishers.test.js has both).
  it('calls a package nothing here publishes its entry, which loads its main', () => {
    has('## What comes in', "4. **@acme/tool** (the package's entry, not published from here). Loads lib/api.js.");
    has('## The other doors', "**@acme/tool** (the package's entry, not published from here) loads lib/api.js.");
  });

  it('says what a command reaches, as it does for a workflow', () => {
    has('## The other doors', '**tool** (a command people run) runs bin/tool.mjs and reaches lib.');
  });

  it('says what the repository is written in, and names the commands people run and no package nothing publishes', () => {
    has('## What this is', '7 parts, mostly JavaScript (6 files). Work enters through 5 doors; CI, kit and tool each reach 2 parts, and CI is followed because it is a workflow, where the others are installed for people to use. People run acme-py, kit and tool.');
    assert.equal(json.derived, section('## What this is')[2]);
  });

  it('tells two doors of one manifest apart in page.json', () => {
    const fromRoot = json.doors.filter((door) => door.file === 'package.json').map((door) => [door.id, door.kind]);
    assert.deepEqual(fromRoot.sort(), [['package.json#@acme/tool', 'package'], ['package.json#tool', 'command']]);
    assert.equal(json.mainDoor, '.github/workflows/ci.yml');
  });

  it('names the command that runs a file when explain is asked about it, and not the manifest as a door', () => {
    const file = spawnSync(process.execPath, [CLI, 'explain', 'bin/tool.mjs'], { cwd: root, encoding: 'utf8' });
    assert.ok(file.stdout.split('\n').includes('Run by tool.'), file.stdout);
    const manifest = spawnSync(process.execPath, [CLI, 'explain', 'package.json'], { cwd: root, encoding: 'utf8' });
    assert.ok(!manifest.stdout.includes('It is the door'), manifest.stdout);
  });
});

describe('two commands of one name', () => {
  it('names each with the manifest that installs it', () => {
    const part = { files: [{ hash: 'a', path: 'bin/tool.js' }, { hash: 'b', path: 'tool/cli.py' }], globs: ['**'], name: 'all', role: 'code' };
    const command = (file, path) => ({ file, kind: 'command', name: 'tool', reach: [{ boundary: 'all', depth: 0, files: 1 }], runs: [{ path, runKind: 'executes' }], stages: [], triggers: [] });
    const structure = { boundaries: [part], doors: [command('package.json', 'bin/tool.js'), command('pyproject.toml', 'tool/cli.py')], edges: [], landings: [] };
    const { markdown: page } = buildPage({ structure, statistics: {}, document: null, repoName: 'acme/tool' });
    assert.ok(page.includes('1. **tool** (a command people run, from package.json). Runs bin/tool.js.'), page);
    assert.ok(page.includes('2. **tool** (a command people run, from pyproject.toml). Runs tool/cli.py.'), page);
    assert.ok(page.includes('**tool** (a command people run, from pyproject.toml) runs tool/cli.py.'), page);
    // What this is names a command once, however many manifests install it.
    assert.ok(page.includes('People run tool.'), page);
  });
});

describe('the busiest door, whatever its kind', () => {
  const reach = (n) => Array.from({ length: n }, (_, i) => ({ boundary: `p${i}`, depth: 0, files: 1 }));
  const ci = { file: '.github/workflows/ci.yml', name: 'CI', reach: reach(1), stages: [], triggers: [{ event: 'push' }] };
  const cli = { kind: 'command', file: 'package.json', name: 'cli', reach: reach(3), stages: [], triggers: [] };
  const helper = { kind: 'command', file: 'package.json', name: 'helper', reach: reach(2), stages: [], triggers: [] };

  it('is followed when a command reaches furthest and no door commits, and keeps its place first', () => {
    assert.equal(mainDoor([ci, cli, helper]), cli);
    assert.deepEqual(orderDoors([helper, ci, cli]).map((door) => door.name), ['cli', 'CI', 'helper']);
  });
});
