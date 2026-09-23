import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { diffAgainstBase, diffMarkdown } from './diff.js';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const HOST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/host');
const HEADING = '## Atlas: what this change does to the map';
const roots = [];

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function commit(cwd, message) {
  git(cwd, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', message]);
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

// The host fixture, with alpha importing beta and the tests importing alpha,
// committed once without a map and once with one, so HEAD~1 is a base that
// carries no map and HEAD is a base that does.
function mappedHost() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-diff-'));
  roots.push(root);
  cpSync(HOST, root, { recursive: true });
  writeFileSync(join(root, 'pkg', 'alpha', 'index.js'), "import './util.js';\nimport '../beta/index.js';\nexport const alpha = 1;\n");
  writeFileSync(join(root, 'tests', 'reads-beta.js'), "import '../pkg/alpha/index.js';\n");
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  commit(root, 'host');
  const mapped = atlas(root, ['map']);
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  git(root, ['add', '--', 'atlas']);
  commit(root, 'map');
  return root;
}

// Every file under the root, .git included, by content and mtime: a verb that
// persisted anything, or let git refresh its index, would change a row.
function snapshot(root) {
  const rows = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      rows.push({
        path: relative(root, path).replaceAll('\\', '/'),
        hash: createHash('sha256').update(readFileSync(path)).digest('hex'),
        mtimeMs: statSync(path).mtimeMs,
      });
    }
  };
  walk(root);
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return rows;
}

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas diff', () => {
  let root;
  let base;

  before(() => {
    root = mappedHost();
    base = git(root, ['rev-parse', 'HEAD']).trim();
  });

  it('says nothing structural changed, in one line under the heading, when the tree is the base', () => {
    const result = atlas(root, ['diff', '--base', 'HEAD']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout, `${HEADING}\n\nNothing structural changed since commit ${base.slice(0, 7)}; no file changed.\n`);
    assert.equal(result.stderr, '');
  });

  it('counts a content-only change and still says nothing structural changed', () => {
    writeFileSync(join(root, 'pkg', 'alpha', 'util.js'), 'export const util = 2;\n');
    const result = atlas(root, ['diff', '--base', 'HEAD']);
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.stdout, `${HEADING}\n\nNothing structural changed since commit ${base.slice(0, 7)}; 1 file changed content.\n`);
  });

  it('lists the page\'s items as bullets, the import that closes a cycle first and the counts line last', () => {
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
    const result = atlas(root, ['diff', '--base', 'HEAD']);
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.stdout, [
      HEADING,
      '',
      '- beta now imports tests, which closes the cycle beta → tests → alpha → beta.',
      '- Nightly (.github/workflows/nightly.yml) is a new door. It starts on a schedule (`0 6 * * 1`), Monday at 06:00 UTC; or by hand. It runs pkg/alpha/cli.js.',
      '- notes/ is now written by pkg/alpha/util.js.',
      '- .github/workflows/nightly.yml is new and belongs to no part, so atlas check fails on it against the previous map.',
      '- 1 file added and 2 changed content, across 2 parts.',
      '',
    ].join('\n'));
  });

  it('gives the same items as JSON, with the base it compared against', () => {
    const result = atlas(root, ['diff', '--base', 'HEAD', '--json']);
    assert.equal(result.status, 0, result.stdout);
    const diff = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(diff), ['base', 'fileCounts', 'items', 'unchanged']);
    assert.deepEqual(diff.base, { commit: base, ref: 'HEAD' });
    assert.equal(diff.unchanged, false);
    assert.deepEqual(diff.fileCounts, { added: 1, changed: 2, moved: 0, parts: 2, removed: 0 });
    assert.deepEqual(diff.items.map((item) => item.kind), ['cycle', 'door', 'landing', 'unassigned', 'counts']);
    assert.deepEqual(diff.items[0].subjects, ['beta', 'tests', 'alpha']);
    const markdown = atlas(root, ['diff', '--base', 'HEAD']).stdout;
    assert.equal(markdown, `${HEADING}\n\n${diff.items.map((item) => `- ${item.sentence}`).join('\n')}\n`);
  });

  it('writes nothing, whether it prints markdown, JSON or an error', () => {
    const before = snapshot(root);
    for (const args of [['diff', '--base', 'HEAD'], ['diff', '--base', 'HEAD', '--json'], ['diff', '--base', 'HEAD~1'], ['diff']]) {
      atlas(root, args);
      assert.deepEqual(snapshot(root), before, args.join(' '));
    }
  });

  it('is the delta the page states when HEAD is the base', () => {
    const diff = JSON.parse(atlas(root, ['diff', '--base', 'HEAD', '--json']).stdout);
    const mapped = atlas(root, ['map']);
    assert.equal(mapped.status, 0, mapped.stdout);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')).changes.items, diff.items);
  });

  it('exits 2 with ATLAS_DIFF_NO_BASE when the base commit carries no map', () => {
    const result = atlas(root, ['diff', '--base', 'HEAD~1']);
    assert.equal(result.status, 2);
    const parent = git(root, ['rev-parse', 'HEAD~1']).trim().slice(0, 7);
    assert.equal(result.stdout, [
      'ATLAS_DIFF_NO_BASE  The base ref carries no map.',
      `  what changed:   HEAD~1 (${parent}) has no atlas/structure.json`,
      '  what to do:     fetch the base ref, or run atlas map on it',
      'exit 2',
      '',
    ].join('\n'));
  });

  it('exits 2 with ATLAS_DIFF_NO_BASE when the base ref is not in the clone', () => {
    const result = atlas(root, ['diff', '--base', 'origin/main']);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /^ATLAS_DIFF_NO_BASE {2}The base ref carries no map\.\n {2}what changed: {3}origin\/main is not a commit in this clone\n/);
  });

  it('assumes no base: a missing or empty --base is a usage error with a one-line hint', () => {
    for (const args of [['diff'], ['diff', '--json'], ['diff', '--base'], ['diff', '--base', '--json']]) {
      const result = atlas(root, args);
      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stdout, /^atlas: (diff needs --base <ref>|--base needs a ref), such as --base origin\/main\nexit 2\n$/, args.join(' '));
    }
    const unknown = atlas(root, ['diff', '--base', 'HEAD', '--since', 'x']);
    assert.equal(unknown.status, 2);
    assert.equal(unknown.stdout, 'atlas: unknown argument --since\nexit 2\n');
  });
});

describe('atlas diff output stays parseable', () => {
  it('sends the ignored-fields notice to stderr, never into the markdown or JSON', () => {
    const root = mappedHost();
    appendFileSync(join(root, 'atlas', 'boundaries.yaml'), 'machine_budget: 3\n');
    const result = atlas(root, ['diff', '--base', 'HEAD', '--json']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /ignored fields no longer read from atlas\/boundaries\.yaml: machine_budget/);
    assert.equal(JSON.parse(result.stdout).unchanged, true);
  });
});

describe('atlas diff on a capped door', () => {
  it('reports nothing when only the kept sample of a capped door shifted', () => {
    const door = (paths, runsCount) => ({ file: 'ci.yml', name: 'CI', reach: [], runs: paths.map((path) => ({ job: 'j', path })), runsCount, triggers: [{ event: 'push' }] });
    const map = (doors) => ({ boundaries: [], doors, edges: [], landings: [], overlaps: [], submodules: [], symlinks: [], unassigned: [] });
    const base = { commit: 'b'.repeat(40), ref: 'main', structure: map([door(['tests/a/1.test.js', 'tests/b/1.test.js'], 400)]) };
    const shifted = diffAgainstBase(base, map([door(['tests/a/9.test.js', 'tests/b/4.test.js'], 400)]));
    assert.equal(shifted.unchanged, true, diffMarkdown(shifted));
    const grown = diffAgainstBase(base, map([door(['tests/a/9.test.js', 'tests/b/4.test.js'], 402)]));
    assert.equal(diffMarkdown(grown).split('\n')[2], '- CI runs 2 more files than before.');
  });
});
