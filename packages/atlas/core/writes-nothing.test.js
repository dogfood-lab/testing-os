import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ALPHA, BETA, makeFixtureRepo } from './fixture-repo.js';

const INDEX = new URL('./index.js', import.meta.url).href;
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function snapshot(root) {
  const rows = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
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
    // The launch directory is watched as well as the fixture: a dynamic
    // import that persists something would most plausibly write there, and
    // the import-graph test cannot see a dynamic import. The map runs in a
    // child launched from an empty directory of its own, so what other tests
    // write beside this one is never mistaken for a write of the core's.
    const launch = mkdtempSync(join(tmpdir(), 'atlas-launch-'));
    roots.push(launch);
    const before = snapshot(root);
    const script = [
      `const { mapRepository } = await import(${JSON.stringify(INDEX)});`,
      'const cwd = process.cwd();',
      `mapRepository({ repoPath: ${JSON.stringify(root)}, boundaries: ${JSON.stringify([ALPHA, BETA])} });`,
      'process.stdout.write(JSON.stringify({ same: process.cwd() === cwd }));',
    ].join('\n');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: launch, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { same: true });
    assert.deepEqual(snapshot(root), before);
    assert.deepEqual(readdirSync(launch), []);
  });
});
