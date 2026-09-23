import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { readCommands, repositoryView } from './commands.js';
import { onlyOnFailure } from './doors.js';
import { makeRecipes, parseJsonc } from './tool-configs.js';

// The command reader's edges, each on a small tree written for the case. The
// fixtures under fixtures/atlas/doors-py and doors-ts carry the conventions
// end to end; these pin the shapes a fixture would bury.

const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function tree(files) {
  const root = mkdtempSync(resolve(tmpdir(), 'atlas-commands-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return repositoryView({ repoPath: root, tracked: new Set(Object.keys(files)) });
}

function runs(repo, text, dir = '') {
  return [...readCommands(text, dir, repo).runs.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

describe('command reader', () => {
  const repo = tree({
    'tools/a.js': '',
    'tools/b.py': '',
    'scripts/t.ts': '',
    'Makefile': 'build:\n\tnode tools/a.js\n',
    'pkg/mod.py': '',
    'pkg/sub/__main__.py': '',
  });

  it('reads the command bash -c is handed', () => {
    assert.deepEqual(runs(repo, 'bash -c "node tools/a.js"'), [{ path: 'tools/a.js' }]);
  });

  it('follows env, timeout and npm exec to the command they start', () => {
    assert.deepEqual(runs(repo, 'env FOO=1 timeout -s KILL 60 python tools/b.py'), [{ path: 'tools/b.py' }]);
    assert.deepEqual(runs(repo, 'npm exec -- tsx scripts/t.ts'), [{ path: 'scripts/t.ts' }]);
  });

  it('runs a module by its __main__ when python -m names a package', () => {
    assert.deepEqual(runs(repo, 'python -m pkg.sub'), [{ path: 'pkg/sub/__main__.py' }]);
    assert.deepEqual(runs(repo, 'python -mpkg.mod'), [{ path: 'pkg/mod.py' }]);
  });

  it('runs nothing a container is asked to run, since it runs on the image', () => {
    assert.deepEqual(runs(repo, 'docker run --rm image make build'), []);
  });

  it('runs a tool an unknown command hands its arguments, the way a shell function does', () => {
    assert.deepEqual(runs(repo, 'run_stage build make build'), [{ path: 'tools/a.js', via: 'Makefile' }]);
  });

  it('writes a checker over the whole tree as the directories its Python files fill', () => {
    assert.deepEqual(runs(repo, 'ruff check .'), [
      { path: 'pkg/', directory: true, matched: true, via: 'ruff' },
      { path: 'tools/b.py', matched: true, via: 'ruff' },
    ]);
  });
});

describe('failure conditions', () => {
  it('holds only when something failed', () => {
    assert.equal(onlyOnFailure('failure()'), true);
    assert.equal(onlyOnFailure('${{ failure() }}'), true);
    assert.equal(onlyOnFailure("failure() && steps.smoke.conclusion == 'failure'"), true);
    assert.equal(onlyOnFailure("always() && needs.gate.result == 'success' && (needs.a.result == 'failure' || needs.b.result == 'failure')"), true);
  });

  it('can hold on a green or cancelled run', () => {
    assert.equal(onlyOnFailure("failure() || github.event_name == 'schedule'"), false);
    assert.equal(onlyOnFailure("always() && (needs.a.result == 'failure' || needs.a.result == 'cancelled')"), false);
    assert.equal(onlyOnFailure('!success()'), false);
    assert.equal(onlyOnFailure('always()'), false);
    assert.equal(onlyOnFailure(undefined), false);
  });
});

describe('configuration readers', () => {
  it('parses JSON with comments and trailing commas, keeping a slash inside a string', () => {
    assert.deepEqual(parseJsonc('{\n  // a comment\n  "a": "x//y", /* b */ "b": [1, 2,],\n}'), { a: 'x//y', b: [1, 2] });
    assert.equal(parseJsonc('{ not json'), null);
  });

  it('runs the first target when make is given none, and spells out its variables', () => {
    const text = 'PY := python3\n\nall: test\n\ntest:\n\t@$(PY) -m pytest $$HOME\n\nother:\n\techo other\n';
    assert.equal(makeRecipes(text, []), 'python3 -m pytest $HOME');
    assert.equal(makeRecipes(text, ['other']), 'echo other');
  });
});
