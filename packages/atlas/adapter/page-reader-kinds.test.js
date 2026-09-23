import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/reader-kinds: a README and its translation that link each
// other and embed a badge by raw URL, a package.json that lists what it
// ships, a docs page that shows a raw-URL fetch, a generated module that code
// imports, and a Starlight site whose sidebar reads a directory a script
// writes.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/reader-kinds');
const roots = [];
let structure;
let page;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function readers(target) {
  return (structure.landings.find((landing) => landing.target === target)?.readers ?? []).map((entry) => `${entry.by} ${entry.call}`);
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-reader-kinds-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'reader-kinds']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what reads a place and what only points at it', () => {
  it('counts no Markdown link or embed as a reader', () => {
    assert.deepEqual(readers('README.md'), []);
    assert.deepEqual(readers('README.ja.md'), []);
    assert.deepEqual(readers('data/badge.svg'), []);
  });

  it('counts no manifest list as a reader, and keeps a raw-URL fetch a page shows', () => {
    assert.deepEqual(readers('data/table.json'), ['docs/usage.md raw-url']);
  });

  it('reads a generated module through the code that imports it', () => {
    assert.deepEqual(readers('src/generated/table.js'), ['src/index.js import']);
  });

  it('reads the Starlight content a sidebar autogenerates from, and the content collection', () => {
    assert.deepEqual(readers('site/src/content/docs/guide'), ['site/astro.config.mjs autogenerate']);
    assert.deepEqual(readers('site/src/content/docs'), ['site/astro.config.mjs content-collection']);
  });

  it('says a place with only links pointing at it is read by nothing, and one that is imported or built from is read', () => {
    const unread = page.unread.map((item) => item.place);
    assert.ok(unread.includes('data/badge.svg'), JSON.stringify(page.unread));
    assert.ok(!unread.includes('src/generated/table.js'), JSON.stringify(page.unread));
    assert.ok(!unread.includes('site/src/content/docs/guide/'), JSON.stringify(page.unread));
  });
});
