import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

/**
 * What mapping ai-rpg-engine, a workspace of 31 TypeScript packages, showed
 * the page getting wrong, each shape reproduced small in fixtures/atlas/ts-probe:
 * a scaffolder writing packages/starter- plus a name, a page quoting a path,
 * imports only from tests, one function exported by three starters, a docs
 * directory with one script, a test that runs a script, and a barrel index.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROBE = resolve(REPO_ROOT, 'fixtures/atlas/ts-probe');
let root;
let structure;
let markdown;
let page;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function atlas(...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next);
}

function file(path) {
  const found = structure.boundaries.flatMap((boundary) => boundary.files).find((item) => item.path === path);
  assert.ok(found, path);
  return found;
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-ts-probe-'));
  cpSync(PROBE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'ts-probe']);
  atlas('map');
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
  page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('what the TypeScript probe found', () => {
  it('lands no write on a directory of parts, so the receipt that was hidden under it surfaces', () => {
    const packages = structure.landings.find((landing) => landing.target === 'packages');
    assert.equal(packages.spans, 6);
    // packages/starter- stops partway through a name the starter directories
    // share: it names one of them or a new one beside them, weakly.
    assert.deepEqual(packages.writers, [
      { by: 'packages/cli/src/create-starter.ts', confidence: 'ast' },
      { by: 'packages/cli/src/create-starter.ts', confidence: 'weak' },
    ]);
    assert.equal(markdown.includes('**packages/**'), false, markdown);
    assert.deepEqual(page.generated.map((item) => item.place), ['packages/ledger/scripts/', 'packages/ledger/scripts/replay-receipt.json']);
    assert.equal(section('## Written but never read'), [
      '## Written but never read',
      '',
      '- **packages/ledger/scripts/** is written by packages/ledger/scripts/live.mjs and read by nothing else in this repository.',
      '- **packages/ledger/scripts/replay-receipt.json** is written by packages/ledger/scripts/replay.mjs and read by nothing else in this repository.',
      '',
    ].join('\n'));
  });

  it('keeps a reader found by text as evidence, and never lets it make a place read', () => {
    const receipt = structure.landings.find((landing) => landing.target === 'packages/ledger/scripts/replay-receipt.json');
    assert.deepEqual(receipt.readers, [{ by: 'docs/receipts.md', call: 'literal', confidence: 'text' }]);
    assert.ok(page.unread.some((item) => item.place === 'packages/ledger/scripts/replay-receipt.json'), JSON.stringify(page.unread));
    // The Replay door writes the receipt. Its readers are grouped under the
    // ledger's directory, since packages/ holds every part.
    assert.equal(section('## Who reads the results'), [
      '## Who reads the results',
      '',
      '- **packages/ledger/** is read by docs/receipts.md (found by text).',
      '',
    ].join('\n'));
    assert.equal(page.breaks.some((entry) => entry.kind === 'place'), false, JSON.stringify(page.breaks));
  });

  it('counts a part imported only from tests apart from the parts that import it to run', () => {
    assert.deepEqual(structure.edges, [
      { from: 'cli', kind: 'file', to: 'core' },
      { from: 'cli', fromTests: true, kind: 'file', to: 'starter-a' },
      { from: 'ledger', fromTests: true, kind: 'file', to: 'core' },
      { from: 'scripts', kind: 'file', to: 'ledger' },
      { from: 'starter-a', kind: 'file', to: 'core' },
      { from: 'starter-b', kind: 'file', to: 'core' },
      { from: 'starter-c', kind: 'file', to: 'core' },
    ]);
    assert.equal(section('## What breaks what'), [
      '## What breaks what',
      '',
      '- **core** is imported by 4 parts (cli, starter-a, starter-b, starter-c), and by 1 more only from tests; it sits on the path of no door.',
      '- **ledger** is imported by 1 part (scripts) and sits on the path of 1 door.',
      '- **starter-a** is imported only from tests, by 1 part (cli), and sits on the path of no door.',
      '',
    ].join('\n'));
    assert.deepEqual(page.breaks[0].importedByTests, ['ledger']);
    // The test edge still reaches: ledger's test imports core, and cli's
    // test imports starter-a, so both count as tested.
    const tested = Object.fromEntries(structure.boundaries.map((boundary) => [boundary.name, boundary.testedBy]));
    assert.equal(tested['starter-a'], 1);
  });

  it('reads require.resolve of a package path as a dependency on that package', () => {
    // scripts/check.mjs locates the ledger's manifest through createRequire;
    // nothing else in scripts names the ledger.
    assert.deepEqual(file('scripts/check.mjs').importsFiles, ['packages/ledger/package.json']);
  });

  it('reads one name exported alike by three parts as one contract, not three copies', () => {
    assert.equal(section('## Helpers that look duplicated'), [
      '## Helpers that look duplicated',
      '',
      'These are candidates from names and call order, not a judgement.',
      '',
      '- **createGame** is exported by 3 parts (starter-a, starter-b and starter-c); with the same name in this many parts it is most likely a shared contract, not a copy.',
      '',
    ].join('\n'));
    assert.deepEqual(page.duplicates, [{
      contract: true,
      files: ['packages/starter-a/src/setup.ts', 'packages/starter-b/src/setup.ts', 'packages/starter-c/src/setup.ts'],
      name: 'createGame',
      partLabels: ['starter-a', 'starter-b', 'starter-c'],
      parts: ['starter-a', 'starter-b', 'starter-c'],
    }]);
  });

  it('calls a directory of ten pages and one script docs', () => {
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'docs').role, 'docs');
    assert.match(section('## Hand-authored'), /^People write \.github\/, docs\/ and the repository root\./m);
  });

  it('reaches the script a test runs by a command written out in full', () => {
    const scripts = structure.boundaries.find((boundary) => boundary.name === 'scripts');
    assert.equal(scripts.testedBy, 1);
    assert.equal(section('## What no test touches').includes('**scripts**'), false);
  });

  it('carries each file\'s imports, and explains a file by the files around it', () => {
    assert.deepEqual(file('packages/core/src/index.ts').importsFiles, ['packages/core/src/engine.ts']);
    assert.deepEqual(file('packages/core/src/index.ts').reexportsAll, ['packages/core/src/engine.ts']);
    assert.deepEqual(file('packages/starter-a/src/setup.ts').importsFiles, ['packages/core/src/index.ts']);
    assert.equal('importsFiles' in file('packages/core/src/engine.ts'), false, 'a file that imports nothing carries no list');
    const engine = atlas('explain', 'packages/core/src/engine.ts').trimEnd().split('\n');
    assert.deepEqual(engine.slice(0, -1), [
      'packages/core/src/engine.ts is in core (code).',
      'No door runs it or reaches its part.',
      'Imports no file in this repository.',
      'Imported by 2 files, 1 of them a test: packages/core/src/index.ts and packages/core/src/engine.spec.ts.',
      'Its own test is packages/core/src/engine.spec.ts.',
      'Its part imports no other part.',
      'Its part is imported by 4 parts: cli, starter-a, starter-b and starter-c, and by 1 more only from tests.',
      'No order of work is recorded; only files a door runs, and the files they call, carry one.',
    ]);
    const barrel = atlas('explain', 'packages/core/src/index.ts').trimEnd().split('\n');
    assert.equal(barrel[2], 'Re-exports everything from packages/core/src/engine.ts.');
    const facts = JSON.parse(atlas('explain', 'packages/starter-a/src/index.ts', '--json'));
    assert.deepEqual(facts.importedByFiles, ['packages/cli/src/cli.spec.ts']);
    assert.deepEqual(facts.importedByTests, ['cli']);
    const broken = atlas('explain', 'packages/ledger/src/broken.ts').trimEnd().split('\n');
    assert.equal(broken[2], 'It could not be parsed, so what it imports is not known.');
    assert.equal(file('packages/ledger/src/broken.ts').parseError, true);
    const starter = atlas('explain', 'packages/starter-a/src/setup.ts').trimEnd().split('\n');
    assert.ok(starter.includes('Its part is imported only from tests, by 1 part: cli.'), starter.join('\n'));
  });
});
