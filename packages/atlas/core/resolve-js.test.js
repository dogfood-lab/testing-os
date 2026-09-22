import { existsSync, renameSync, rmSync } from 'node:fs';
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

  it('resolves every @dogfood-lab import in this repository with node_modules renamed away', () => {
    const hidden = join(REPO, 'node_modules.atlas-2b-hidden');
    const live = join(REPO, 'node_modules');
    assert.equal(existsSync(hidden), false);
    renameSync(live, hidden);
    try {
      const result = mapRepository({
        repoPath: REPO,
        boundaries: [{ name: 'packages', globs: ['packages/**'] }],
      });
      const files = result.boundaries[0].files.filter((file) => file.path.startsWith('packages/'));
      const bad = [];
      for (const file of files) {
        if (!Array.isArray(file.imports)) continue;
        for (const site of file.imports) {
          if (!site.specifier.startsWith('@dogfood-lab/')) continue;
          const ok = site.resolved?.outcome === 'file' && site.resolved.path?.startsWith('packages/');
          if (!ok) bad.push(`${file.path} ${site.specifier} ${JSON.stringify(site.resolved)}`);
        }
      }
      assert.deepEqual(bad, []);
      let notFound = 0;
      for (const file of files) {
        if (!Array.isArray(file.imports)) continue;
        for (const site of file.imports) {
          if (site.resolved?.reason === 'module-not-found') notFound += 1;
        }
      }
      assert.equal(notFound, 0);
    } finally {
      if (existsSync(hidden)) renameSync(hidden, live);
    }
  });
});
