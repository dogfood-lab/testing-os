import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { ALPHA, BETA, makeFixtureRepo } from './fixture-repo.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function snapshot(root, skip = new Set()) {
  const rows = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      const info = statSync(path);
      rows.push({
        path: relative(root, path).replaceAll('\\', '/'),
        hash: createHash('sha256').update(readFileSync(path)).digest('hex'),
        mtimeMs: info.mtimeMs,
      });
    }
  };
  walk(root);
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return rows;
}

describe('mapRepository writes nothing', () => {
  it('leaves the fixture repo and the process working directory unchanged', () => {
    const root = makeFixtureRepo();
    roots.push(root);
    const cwd = process.cwd();
    // The launch directory is watched as well as the fixture: a dynamic
    // import that persists something would most plausibly write here, and the
    // import-graph test cannot see a dynamic import. node_modules and .git are
    // skipped only for the launch directory, since neither is somewhere the
    // core could legitimately write and both are large.
    const cwdSkip = new Set(['node_modules', '.git']);
    const before = snapshot(root);
    const cwdBefore = snapshot(cwd, cwdSkip);
    mapRepository({ repoPath: root, boundaries: [ALPHA, BETA] });
    assert.equal(process.cwd(), cwd);
    assert.deepEqual(snapshot(root), before);
    assert.deepEqual(snapshot(cwd, cwdSkip), cwdBefore);
  });
});
