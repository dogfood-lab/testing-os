import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// atlas gaps [path]: what no test imports or runs, and what should reach it,
// for a repository, a part, a directory or a file, from the committed map
// (docs/atlas-test-gaps.spec.md, "Where it answers"; acceptance 9: the
// checkout is as it was after the command).

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GAPS = resolve(REPO_ROOT, 'fixtures/atlas/gaps');
// The plain line, or the line with the upstream clause slice AH added: a
// checkout whose fetched upstream holds a newer map is told so, and this
// repository's own checkout is such a checkout whenever main has moved.
const MAP_LINE = /^Map from commit [0-9a-f]{7}, \d{4}-\d{2}-\d{2}(\.|; origin\/\S+ holds a different map, .+: run with --ref origin\/\S+ to answer from it\.)$/;
const roots = [];
let repo;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function repoFrom(fixture) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-gaps-'));
  roots.push(root);
  if (fixture) cpSync(fixture, root, { recursive: true });
  else writeFileSync(join(root, 'README.md'), 'no map here\n');
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'fixture']);
  return root;
}

function gaps(cwd, ...args) {
  const result = spawnSync(process.execPath, [CLI, 'gaps', ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, lines: result.stdout.trimEnd().split('\n') };
}

function answered(cwd, ...args) {
  const result = gaps(cwd, ...args);
  assert.equal(result.status, 0, result.stdout);
  return result.lines;
}

// Every file under root with its bytes and mtime, .git left out.
function snapshot(root) {
  const rows = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      rows.push({ path: relative(root, path).replaceAll('\\', '/'), hash: createHash('sha256').update(readFileSync(path)).digest('hex'), mtimeMs: statSync(path).mtimeMs });
    }
  };
  walk(root);
  return rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

before(() => {
  repo = repoFrom(GAPS);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: repo, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas gaps on the gaps fixture', () => {
  it('answers for the repository: what CI runs, what tests reach, the ranked code gaps and the hygiene items apart', () => {
    const lines = answered(repo);
    assert.equal(lines[0], 'Test gaps in this repository, from its map.');
    assert.equal(lines[1], 'CI runs vitest through npm test (1 test file), collecting no coverage.');
    assert.equal(lines[2], 'No workflow uploads coverage to Codecov.');
    assert.ok(lines.includes('Tests reach 1 of 4 code parts: src (imports, 2 of 6 files). No test imports or runs bin, lib or tools.'), lines.join('\n'));
    assert.ok(lines.some((line) => /^\d\. lib \(a part of 3 code files, Node\/TypeScript library or CLI\): no test imports or runs it; vitest would reach it\./.test(line)), lines.join('\n'));
    const ranked = lines.indexOf('Code gaps, the 5 ranked highest of 7:');
    assert.notEqual(ranked, -1, lines.join('\n'));
    assert.match(lines[ranked + 1], /^1\. src\/format\.ts \(src, Node\/TypeScript library or CLI\): no test imports or runs it; vitest would reach it\./);
    assert.ok(lines.includes('And 2 more code gaps, with 1 more suggestion; ask about a part, directory or file for its own.'), lines.join('\n'));
    // A gap's suggestions follow it.
    const parse = lines.findIndex((line) => /^\d\. src\/parse\.ts /.test(line));
    assert.ok(lines[parse + 1].startsWith('   G6 src/parse.ts: tests that make the catch in parse (line 6) and the throw in parse (line 7) run'), lines.join('\n'));
    assert.ok(lines.some((line) => line.startsWith('G2 e2e/flow.test.ts, run by no workflow: let Vitest')), lines.join('\n'));
    assert.ok(lines.some((line) => line.startsWith('G4 CI runs vitest and collects no coverage: collect coverage as the studio does')), lines.join('\n'));
    assert.ok(lines.some((line) => line.startsWith('G3 gapcli (bin/gapcli.js): no test imports or runs it, and no workflow starts it.')), lines.join('\n'));
    assert.match(lines.at(-1), MAP_LINE);
  });

  it('carries the same answer as fields with --json', () => {
    const answer = JSON.parse(gaps(repo, '--json').stdout);
    assert.deepEqual(answer.found, { kind: 'repository', path: null, part: null });
    assert.equal(answer.gaps.items[0].path, 'src/format.ts');
    assert.deepEqual(answer.gaps.items[0].wouldReach, { runners: ['vitest'] });
    assert.equal(answer.gaps.rest, 2);
    assert.deepEqual(answer.gaps.items.flatMap((item) => item.suggestions.map((entry) => `${entry.rule} ${entry.path ?? entry.part}`)), ['G6 src/parse.ts']);
    assert.equal(answer.gaps.suggestionsLeft, 1);
    assert.deepEqual(answer.hygiene.map((entry) => entry.rule).sort(), ['G2', 'G4']);
    assert.deepEqual(answer.commands.map((entry) => entry.facts.command), ['gapcli']);
  });

  it('answers for one part, with the hygiene items of the runners that reach it', () => {
    const answer = JSON.parse(gaps(repo, 'src', '--json').stdout);
    assert.deepEqual(answer.found, { kind: 'part', path: null, part: 'src' });
    assert.deepEqual(answer.gaps.items.map((item) => item.path).sort(), ['src/extra.ts', 'src/format.ts', 'src/index.ts', 'src/parse.ts']);
    assert.deepEqual(answer.gaps.items.flatMap((item) => item.suggestions.map((entry) => entry.rule)), ['G6']);
    assert.deepEqual(answer.hygiene.map((entry) => entry.rule), ['G4']);
    assert.deepEqual(answer.commands, []);
  });

  it('answers for a file no test reaches, leading with what would reach it', () => {
    const lines = answered(repo, 'src/parse.ts');
    assert.equal(lines[0], 'Test gaps for src/parse.ts (src, Node/TypeScript library or CLI), from its map.');
    assert.equal(lines[1], 'No test imports or runs it; vitest would reach it.');
    assert.ok(lines[2].startsWith('G6 src/parse.ts: '), lines.join('\n'));
  });

  it('answers for a file in a part no test reaches with the part\'s runner suggestion', () => {
    const lines = answered(repo, 'tools/report.py');
    assert.equal(lines[1], 'No test imports or runs it; pytest with pytest-cov would reach it.');
    assert.ok(lines[2].startsWith('G1 tools: no runner here runs tests of its kind, Python library or CLI: a first test that imports tools/report.py'), lines.join('\n'));
  });

  it('answers for a file a test reaches, naming the test and how', () => {
    const lines = answered(repo, 'src/util.ts');
    assert.match(lines[1], /^(e2e\/flow|test\/core)\.test\.ts imports it, through src\/core\.ts \(parsed\)\.$/);
  });

  it('answers for a directory by the files under it, and for a part by its name', () => {
    const directory = JSON.parse(gaps(repo, 'e2e', '--json').stdout);
    assert.deepEqual(directory.found, { kind: 'directory', path: 'e2e', part: null });
    assert.deepEqual(directory.hygiene.map((entry) => entry.rule), ['G2']);
    assert.deepEqual(JSON.parse(gaps(repo, 'lib', '--json').stdout).found, { kind: 'part', path: null, part: 'lib' });
  });

  it('says so when the path names nothing in the map', () => {
    const result = gaps(repo, 'nowhere/at-all.ts');
    assert.equal(result.status, 2);
    assert.match(result.stdout, /ATLAS_GAPS_UNKNOWN_PATH/);
  });

  it('leaves the checkout as it was', () => {
    const before = snapshot(repo);
    answered(repo);
    answered(repo, 'src/parse.ts', '--json');
    assert.deepEqual(snapshot(repo), before);
    assert.equal(git(repo, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter((line) => line && !line.includes('atlas/')).length, 0);
  });
});

describe('atlas gaps with no map', () => {
  it('names the map it needs', () => {
    const bare = repoFrom(null);
    const result = gaps(bare);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /ATLAS_GAPS_NO_MAP/);
    assert.match(result.stdout, /atlas map/);
  });
});

// fixtures/atlas/reach-names: a file a test names in a string, by a way the
// map cannot follow to an import or a run, is answered as named, with the
// test that names it; Atlas does not say no test imports or runs it.
describe('atlas gaps on a file a test names in a string', () => {
  let named;
  before(() => {
    named = repoFrom(resolve(REPO_ROOT, 'fixtures/atlas/reach-names'));
    const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: named, encoding: 'utf8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  });

  it('names the test whose string spells its name, and says what Atlas cannot tell', () => {
    const lines = answered(named, 'tools/tool_a.py');
    assert.equal(lines[1], 'tests/test_tools.py spells its name in a string; Atlas cannot tell whether that test runs it (text).');
    assert.equal(lines.some((line) => line.startsWith('G6 ')), false, lines.join('\n'));
  });

  it('says what a named file imports is named with it, through that file', () => {
    const lines = answered(named, 'scripts/lib/util.mjs');
    assert.equal(lines[1], 'test/gen.test.mjs spells the name of scripts/gen.mjs in a string, and that file imports it; Atlas cannot tell whether that test runs it (text).');
  });

  it('counts a part only named as spelled in a test\'s string, apart from the parts tests reach', () => {
    const lines = answered(named);
    assert.ok(lines.includes('Tests reach 2 of 3 code parts: scripts (spelled in a test\'s string, 2 of 2 files) and tools (spelled in a test\'s string, 2 of 3 files). No test imports or runs pair.'), lines.join('\n'));
  });
});
