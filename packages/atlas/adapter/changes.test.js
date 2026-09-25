import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { changesSince, compareStructures, fileCounts } from './changes.js';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const HOST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/host');
const roots = [];

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function commit(cwd, message) {
  git(cwd, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', message]);
}

function map(cwd) {
  const result = spawnSync(process.execPath, [CLI, 'map'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

function read(cwd, name) {
  return readFileSync(join(cwd, 'atlas', name), 'utf8');
}

function section(markdown) {
  const start = markdown.indexOf('## What changed since ');
  assert.ok(start >= 0, 'the section is on the page');
  const next = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, next === -1 ? markdown.length : next);
}

// The page's only clock-bound text is the date it was mapped on.
function settle(text) {
  return text.replace(/^Mapped at \S+ from/m, 'Mapped at DATE from');
}

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what changed since the last map', () => {
  let root;
  let since;

  // The host fixture, with alpha importing beta and the tests importing alpha,
  // so one more import from beta into the tests closes a three-part cycle.
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'atlas-changes-'));
    roots.push(root);
    cpSync(HOST, root, { recursive: true });
    writeFileSync(join(root, 'pkg', 'alpha', 'index.js'), "import './util.js';\nimport '../beta/index.js';\nexport const alpha = 1;\n");
    writeFileSync(join(root, 'tests', 'reads-beta.js'), "import '../pkg/alpha/index.js';\n");
    git(root, ['init']);
    git(root, ['config', 'core.autocrlf', 'false']);
    git(root, ['add', '-A']);
    commit(root, 'host');
    since = git(root, ['rev-parse', 'HEAD']).trim();
  });

  it('says this is the first map when HEAD carries no artifact', () => {
    map(root);
    const markdown = read(root, 'README.md');
    const at = markdown.indexOf('## What changed since the last map\n\nThis is the first map.\n');
    assert.ok(at > markdown.indexOf('## What this is\n'), 'after "What this is"');
    assert.deepEqual(JSON.parse(read(root, 'page.json')).changes, { first: true });
  });

  it('says nothing structural changed, in one line, when the tree is the committed one', () => {
    git(root, ['add', '--', 'atlas']);
    commit(root, 'map');
    map(root);
    const date = JSON.parse(git(root, ['show', 'HEAD:atlas/statistics.json'])).generatedAt.slice(0, 10);
    assert.equal(section(read(root, 'README.md')), `## What changed since ${date} (${since.slice(0, 7)})\n\nNothing structural changed since ${date}; no file changed.\n`);
    const changes = JSON.parse(read(root, 'page.json')).changes;
    assert.equal(changes.unchanged, true);
    assert.equal(changes.since.commit, since);
    assert.deepEqual(changes.fileCounts, { added: 0, changed: 0, moved: 0, parts: 0, removed: 0 });
  });

  it('counts a content-only change and still says nothing structural changed', () => {
    writeFileSync(join(root, 'pkg', 'alpha', 'util.js'), 'export const util = 2;\n');
    map(root);
    assert.match(section(read(root, 'README.md')), /\n\nNothing structural changed since \d{4}-\d\d-\d\d; 1 file changed content\.\n$/);
  });

  it('leads with the import that closes a cycle, then the new door, the new writer and the counts', () => {
    writeFileSync(join(root, 'pkg', 'alpha', 'util.js'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('notes/summary.txt', 'x');\nexport const util = 1;\n");
    writeFileSync(join(root, 'pkg', 'beta', 'index.js'), "import '../../tests/reads-beta.js';\nexport const beta = 1;\n");
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(root, '.github', 'workflows', 'nightly.yml'), [
      'name: Nightly',
      'on:',
      '  schedule:',
      "    - cron: '0 6 * * 1'",
      '  workflow_dispatch:',
      'jobs:',
      '  run:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: node pkg/alpha/cli.js',
      '',
    ].join('\n'));
    git(root, ['add', '-A']);
    map(root);
    const bullets = section(read(root, 'README.md')).split('\n').filter((line) => line.startsWith('- '));
    assert.deepEqual(bullets, [
      '- beta now imports tests, which closes the cycle beta → tests → alpha → beta.',
      '- Nightly (.github/workflows/nightly.yml) is a new door. It starts on a schedule (`0 6 * * 1`), Monday at 06:00 UTC; or by hand. It runs pkg/alpha/cli.js.',
      '- notes/summary.txt is now written by pkg/alpha/util.js.',
      '- .github/workflows/nightly.yml is new and belongs to no part, so atlas check fails on it against the previous map.',
      '- 1 file added and 2 changed content, across 2 parts.',
    ]);
    const changes = JSON.parse(read(root, 'page.json')).changes;
    assert.deepEqual(changes.items.map((item) => item.kind), ['cycle', 'door', 'landing', 'unassigned', 'counts']);
    assert.deepEqual(changes.items[0].subjects, ['beta', 'tests', 'alpha']);
    assert.equal(changes.unchanged, false);
  });

  it('gives the same bytes on a second map at the same HEAD, because it reads HEAD and not the working copy', () => {
    const readme = read(root, 'README.md');
    const structure = read(root, 'structure.json');
    map(root);
    assert.equal(settle(read(root, 'README.md')), settle(readme));
    assert.equal(read(root, 'structure.json'), structure);
    assert.match(read(root, 'README.md'), /- beta now imports tests, which closes the cycle/);
  });

  it('is not consulted by the check', () => {
    const result = spawnSync(process.execPath, [CLI, 'check'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout);
  });
});

function part(name, files, extra = {}) {
  return {
    entryPoints: [],
    files: files.map((path) => ({ hash: `h-${path}`, path })),
    globs: [`${name}/**`],
    name,
    origin: 'authored',
    role: 'code',
    ...extra,
  };
}

function structure({ parts = [], edges = [], doors = [], landings = [], unassigned = [] } = {}) {
  return {
    boundaries: parts,
    doors,
    edges: edges.map(([from, to]) => ({ from, kind: 'file', to })),
    generatedFrom: { commit: 'c'.repeat(40), tracked: 0 },
    landings,
    overlaps: [],
    submodules: [],
    symlinks: [],
    unassigned,
  };
}

function door(file, { name = file, triggers = [{ event: 'workflow_dispatch' }], runs = [], reach = [] } = {}) {
  return { file, name, reach, runs: runs.map((path) => ({ job: 'j', path })), triggers };
}

function sentences(result) {
  return result.items.map((item) => item.sentence);
}

describe('compareStructures', () => {
  it('says an import that joins two parts already on one cycle extends it', () => {
    const parts = ['a', 'b', 'c'].map((name) => part(name, [`${name}/x.js`]));
    const previous = structure({ parts, edges: [['a', 'b'], ['b', 'c'], ['c', 'a']] });
    const current = structure({ parts, edges: [['a', 'b'], ['b', 'a'], ['b', 'c'], ['c', 'a']] });
    assert.equal(sentences(compareStructures(previous, current))[0], 'b now imports a, which extends the cycle b → a → b.');
  });

  it('keeps three items a kind and twelve in all, counts what it cuts, and never cuts a cycle', () => {
    const names = Array.from({ length: 16 }, (_, index) => `p${String(index).padStart(2, '0')}`);
    const parts = names.map((name) => part(name, [`${name}/x.js`]));
    const cycle = [['p00', 'p01'], ['p01', 'p02'], ['p02', 'p03'], ['p03', 'p00']];
    const previous = structure({ parts, edges: [['p01', 'p02'], ['p02', 'p03'], ['p03', 'p00']] });
    const fanOut = names.slice(4, 10).map((name) => ['p10', name]);
    const extraCycles = [['p11', 'p12'], ['p12', 'p11'], ['p13', 'p14'], ['p14', 'p13']];
    const flips = parts.map((item) => ({ ...item, origin: 'generated' }));
    const current = structure({ parts: flips, edges: [...cycle, ...fanOut, ...extraCycles] });
    const doorsBefore = [];
    const doorsAfter = Array.from({ length: 5 }, (_, index) => door(`.github/workflows/d${index}.yml`, { name: `d${index}` }));
    const result = compareStructures({ ...previous, doors: doorsBefore }, { ...current, doors: doorsAfter });
    const kinds = result.items.map((item) => item.kind);
    assert.equal(kinds.filter((kind) => kind === 'cycle').length, 5, 'every new import on a cycle is shown');
    assert.deepEqual(kinds.slice(0, 5), ['cycle', 'cycle', 'cycle', 'cycle', 'cycle']);
    assert.deepEqual(sentences(result).slice(5, 9), [
      'p10 now imports p04.',
      'p10 now imports p05.',
      'p10 now imports p06.',
      'And 3 more new imports between parts.',
    ]);
    const shown = result.items.filter((item) => item.subjects.length > 0 && item.kind !== 'counts');
    assert.equal(shown.length, 12, 'twelve items in all, cycles included');
    assert.deepEqual(sentences(result).filter((sentence) => sentence.startsWith('And ')), [
      'And 3 more new imports between parts.',
      'And 2 more changes to doors.',
      'And 15 more origin changes.',
    ]);
    assert.equal(kinds.at(-1), 'counts');
  });

  it('words a removed import, an origin flip, a rename, a new part and a gone part', () => {
    const previous = structure({
      parts: [part('a', ['a/x.js']), part('b', ['b/x.js']), part('old', ['o/x.js'], { globs: ['o/**'] }), part('gone', ['g/x.js'])],
      edges: [['a', 'b']],
    });
    const current = structure({
      parts: [part('a', ['a/x.js'], { origin: 'mixed' }), part('b', ['b/x.js']), part('new', ['o/x.js'], { globs: ['o/**'] }), part('fresh', ['f/x.js'])],
    });
    assert.deepEqual(sentences(compareStructures(previous, current)), [
      'a no longer imports b.',
      'a was authored and is now mixed.',
      'old is now called new.',
      'fresh is a new part, drawn from `fresh/**`.',
      'gone is no longer a part.',
      '1 file added, 1 removed and 1 moved, across 4 parts.',
    ]);
  });

  it('names the glob a trigger gained, a run added and a door removed', () => {
    const parts = [part('tools', ['tools/a.js', 'tools/b.js'])];
    const push = (paths) => [{ event: 'push', paths }, { event: 'workflow_dispatch' }];
    const previous = structure({ parts, doors: [door('ci.yml', { name: 'CI', triggers: push(['tools/**']), runs: ['tools/a.js'] }), door('old.yml', { name: 'Old' })] });
    const current = structure({ parts, doors: [door('ci.yml', { name: 'CI', triggers: push(['atlas/**', 'tools/**']), runs: ['tools/a.js', 'tools/b.js'] })] });
    assert.deepEqual(sentences(compareStructures(previous, current)), [
      "CI's push trigger now also names `atlas/**`.",
      'CI now also runs tools/b.js.',
      'Old (old.yml) is no longer a door.',
      'No file changed.',
    ]);
  });

  it('compares a capped door by its directories and its count, never by the sample it kept', () => {
    // Two recorded samples from one capped door: the cap keeps a file from
    // each directory in turn, so a file added elsewhere shifts which files
    // are kept although no directory was gained or lost.
    const parts = [part('tests', ['tests/a/1.test.js'])];
    const capped = (paths, runsCount) => ({ ...door('ci.yml', { name: 'CI', runs: paths }), runsCount });
    const before = capped(['tests/a/1.test.js', 'tests/b/1.test.js', 'scripts/check.mjs'], 250);
    const shifted = capped(['tests/a/2.test.js', 'tests/b/7.test.js', 'scripts/check.mjs'], 250);
    assert.deepEqual(sentences(compareStructures(structure({ parts, doors: [before] }), structure({ parts, doors: [shifted] }))), [
      'Nothing structural changed since the last map; no file changed.',
    ]);
    const grown = capped(['tests/a/2.test.js', 'tests/b/7.test.js', 'scripts/check.mjs'], 253);
    assert.deepEqual(sentences(compareStructures(structure({ parts, doors: [before] }), structure({ parts, doors: [grown] }))), [
      'CI runs 3 more files than before.',
      'No file changed.',
    ]);
    const moved = capped(['tests/a/2.test.js', 'tests/c/1.test.js', 'scripts/check.mjs', 'run.sh'], 249);
    assert.deepEqual(sentences(compareStructures(structure({ parts, doors: [before] }), structure({ parts, doors: [moved] }))), [
      'CI now also runs files in the repository root and tests/c/.',
      'CI no longer runs files in tests/b/.',
      'CI runs 1 fewer file than before.',
      'No file changed.',
    ]);
    // Uncapped on both sides, the files themselves are compared as before.
    const small = door('ci.yml', { name: 'CI', runs: ['tests/a/1.test.js'] });
    const smallAfter = door('ci.yml', { name: 'CI', runs: ['tests/a/2.test.js'] });
    assert.deepEqual(sentences(compareStructures(structure({ parts, doors: [small] }), structure({ parts, doors: [smallAfter] }))).slice(0, 2), [
      'CI now also runs tests/a/2.test.js.',
      'CI no longer runs tests/a/1.test.js.',
    ]);
  });

  it('states a step gained in the order of work, with the step it comes before', () => {
    const call = (name, file = 'lib/x.js') => ({ line: 1, name, target: { file } });
    const sequenceFile = (calls) => ({
      entry: 'run',
      entryRule: 1,
      hash: 'h',
      path: 'tools/run.js',
      sequences: [{ calls, exported: true, invokedAtTopLevel: true, isDefaultExport: false, name: 'run' }],
    });
    const build = (calls) => structure({
      parts: [{ ...part('tools', []), files: [sequenceFile(calls)] }, part('lib', ['lib/x.js'])],
      doors: [door('main.yml', { runs: ['tools/run.js'], reach: [{ boundary: 'tools', depth: 0, files: 1 }] })],
    });
    const previous = build([call('loadPolicy'), call('writeRecord')]);
    const current = build([call('loadPolicy'), call('validateRequiredSteps'), call('writeRecord')]);
    assert.deepEqual(sentences(compareStructures(previous, current)), [
      'In tools/run.js, run gained a step, validate required steps, before write record.',
      'No file changed.',
    ]);
  });

  it('counts a file whose bytes moved to a new path as moved, not added and removed', () => {
    const previous = structure({ parts: [part('a', ['a/x.js'])] });
    const current = structure({ parts: [{ ...part('b', []), files: [{ hash: 'h-a/x.js', path: 'b/x.js' }] }] });
    assert.deepEqual(fileCounts(previous, current), { added: 0, changed: 0, moved: 1, parts: 2, removed: 0 });
  });

  it('tells two commands of one manifest apart, and calls a new one a command, not a door that starts on nothing', () => {
    const command = (name, path) => ({ file: 'package.json', kind: 'command', name, reach: [], runs: [{ path }], triggers: [] });
    const previous = structure({ doors: [command('tool', 'bin/tool.mjs')] });
    const current = structure({ doors: [command('tool', 'bin/tool.mjs'), command('tool-admin', 'bin/admin.mjs')] });
    assert.deepEqual(sentences(compareStructures(previous, current)), [
      'tool-admin (package.json) is a new command. It runs bin/admin.mjs.',
      'No file changed.',
    ]);
    assert.deepEqual(sentences(compareStructures(current, previous)), [
      'tool-admin (package.json) is no longer a command.',
      'No file changed.',
    ]);
  });

  it('says a door now checks a path a linter reads, apart from what it runs', () => {
    const ci = (runs) => ({ file: '.github/workflows/ci.yml', name: 'CI', reach: [], runs, triggers: [{ event: 'push' }] });
    const previous = structure({ doors: [ci([{ job: 'j', path: 'scripts/gate.mjs', runKind: 'executes' }])] });
    const current = structure({ doors: [ci([
      { job: 'j', path: 'lib/', directory: true, runKind: 'checks' },
      { job: 'j', path: 'scripts/gate.mjs', runKind: 'executes' },
      { job: 'j', path: 'test/', directory: true, runKind: 'executes' },
    ])] });
    assert.deepEqual(sentences(compareStructures(previous, current)), [
      'CI now also runs test/.',
      'CI now also checks lib/.',
      'No file changed.',
    ]);
  });

  // fixtures/atlas/release-binaries: a binary a release builds to ship and
  // runs nowhere is said as built.
  it('says a door now builds a binary it ships, apart from what it runs and checks', () => {
    const release = (runs) => ({ file: '.github/workflows/release.yml', name: 'Release', reach: [], runs, triggers: [{ event: 'release' }] });
    const previous = structure({ doors: [release([{ job: 'j', path: 'scripts/notes.mjs', runKind: 'executes' }])] });
    const current = structure({ doors: [release([
      { job: 'j', path: 'scripts/notes.mjs', runKind: 'executes' },
      { job: 'j', path: 'src/lib.rs', runKind: 'checks' },
      { job: 'j', path: 'src/main.rs', runKind: 'executes', built: true },
    ])] });
    assert.deepEqual(sentences(compareStructures(previous, current)), [
      'Release now also builds src/main.rs.',
      'Release now also checks src/lib.rs.',
      'No file changed.',
    ]);
  });

  it('says first when there is no committed structure', () => {
    assert.deepEqual(changesSince(null, structure()), { first: true });
  });
});
