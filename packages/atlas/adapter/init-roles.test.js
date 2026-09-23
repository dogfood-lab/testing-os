import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { roleFor } from './templates.js';

// fixtures/atlas/init-roles, read by atlas init: an Astro site of pages and
// one config module, a workspace package whose docs outnumber its source, a
// .github/ holding one workflow beside eleven release notes, and a tools/
// directory whose index is a test.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/init-roles');
const roots = [];
let root;
let init;
let roles;

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function atlas(...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-init-roles-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(['init']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '-A']);
  git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'init-roles']);
  init = atlas('init');
  const file = parse(readFileSync(join(root, 'atlas', 'boundaries.yaml'), 'utf8'));
  roles = Object.fromEntries(file.boundaries.map((boundary) => [boundary.name, boundary.role]));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('roles by what the files are', () => {
  it('reads a part holding an Astro config or Starlight content as the site', () => {
    assert.equal(roles.site, 'site', init);
    assert.equal(roleFor(['web/src/content/docs/a.md', 'web/src/content/docs/b.md']), 'site');
  });

  it('reads a part whose src/ holds code as code, however many pages sit beside it', () => {
    assert.equal(roles.kernel, 'code', init);
    assert.equal(roleFor(['lib-pkg/lib/a.py', ...Array.from({ length: 9 }, (_, i) => `lib-pkg/docs/${i}.md`)]), 'code');
  });

  it('reads .github/ as config when it holds a workflow, whatever else is beside it', () => {
    assert.equal(roles['.github'], 'config', init);
  });

  it('never proposes a test file as an entry point', () => {
    const line = init.split('\n').find((text) => text.trim().startsWith('tools '));
    assert.match(line, /entry: tools\/cli\.js$/, init);
  });

  it('accepts the site role in the boundary file, names the part the site, and leaves it out of what no test touches', () => {
    atlas('map');
    const page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
    assert.equal(page.partLabels.site, 'the site');
    assert.ok(!page.untested.some((item) => item.part === 'site'), JSON.stringify(page.untested));
    assert.ok(page.authored.includes('site/'), JSON.stringify(page.authored));
  });
});
