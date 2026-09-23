import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { RESOLVE_JS, makeRepo } from './fixture-repo.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function resolved(result, path) {
  const files = [
    ...result.boundaries.flatMap((boundary) => boundary.files),
    ...result.unassigned,
  ];
  const file = files.find((entry) => entry.path === path);
  assert.ok(file, path);
  return Object.fromEntries(file.imports.map((site) => [site.specifier, site.resolved]));
}

describe('javascript resolution', () => {
  it('resolves relative files, index files, export wildcards, aliases, builtins and third-party packages', () => {
    const root = makeRepo(RESOLVE_JS);
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    const sites = resolved(result, 'app/main.js');
    assert.deepEqual(sites['./plain'], { outcome: 'file', path: 'app/plain.js' });
    assert.deepEqual(sites['./plain.js'], { outcome: 'file', path: 'app/plain.js' });
    assert.deepEqual(sites['./dir'], { outcome: 'file', path: 'app/dir/index.js' });
    assert.deepEqual(sites['@example/pkg/lib/util.js'], { outcome: 'file', path: 'pkg/lib/util.js' });
    assert.deepEqual(sites['@alias/alias-target'], { outcome: 'file', path: 'app/alias-target.js' });
    assert.deepEqual(sites.express, { outcome: 'external' });
    assert.deepEqual(sites['node:fs'], { outcome: 'external' });
  });

  it('resolves a .js specifier in TypeScript to the .ts source, even when a .js file is also present', () => {
    const root = makeRepo(RESOLVE_JS);
    roots.push(root);
    const result = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    const onlyTs = resolved(result, 'app/a.ts');
    const both = resolved(result, 'app/c.ts');
    assert.deepEqual(onlyTs['./b.js'], { outcome: 'file', path: 'app/b.ts' });
    assert.deepEqual(both['./d.js'], { outcome: 'file', path: 'app/d.ts' });
  });

  // The tracked workspace is copied to a temporary repository, where there is
  // no node_modules to resolve through. Renaming this repository's own
  // node_modules away would break every test running beside this one.
  it('resolves every @dogfood-lab import in this repository without node_modules', () => {
    const copy = mkdtempSync(join(tmpdir(), 'atlas-resolve-'));
    roots.push(copy);
    const listed = spawnSync('git', ['ls-files', '-z', '--', 'packages', 'package.json', 'tsconfig.base.json', 'tsconfig.json'], { cwd: REPO, encoding: 'utf8' });
    assert.equal(listed.status, 0, listed.stderr);
    for (const path of listed.stdout.split('\0').filter(Boolean)) {
      if (!existsSync(join(REPO, path))) continue;
      mkdirSync(dirname(join(copy, path)), { recursive: true });
      cpSync(join(REPO, path), join(copy, path));
    }
    assert.equal(existsSync(join(copy, 'node_modules')), false);
    const git = (args) => assert.equal(spawnSync('git', args, { cwd: copy, encoding: 'utf8' }).status, 0, args.join(' '));
    git(['init', '--quiet']);
    git(['add', '-A']);
    const result = mapRepository({
      repoPath: copy,
      boundaries: [{ name: 'packages', globs: ['packages/**'] }],
    });
    const files = result.boundaries[0].files.filter((file) => file.path.startsWith('packages/'));
    const bad = [];
    let workspace = 0;
    for (const file of files) {
      if (!Array.isArray(file.imports)) continue;
      for (const site of file.imports) {
        if (!site.specifier.startsWith('@dogfood-lab/')) continue;
        workspace += 1;
        const ok = site.resolved?.outcome === 'file' && site.resolved.path?.startsWith('packages/');
        if (!ok) bad.push(`${file.path} ${site.specifier} ${JSON.stringify(site.resolved)}`);
      }
    }
    assert.ok(workspace > 0, 'the copy has workspace imports to resolve');
    assert.deepEqual(bad, []);
    let notFound = 0;
    for (const file of files) {
      if (!Array.isArray(file.imports)) continue;
      for (const site of file.imports) {
        if (site.resolved?.reason === 'module-not-found') notFound += 1;
      }
    }
    assert.equal(notFound, 0);
  });
});
