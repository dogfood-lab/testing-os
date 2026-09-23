import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const HOST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/host');
const roots = [];

// The page's only clock-bound text is the date it was mapped on, and page.json
// carries the full timestamp; everything else must match byte for byte.
function settle(text) {
  return text
    .replace(/^Mapped at \S+ from/m, 'Mapped at DATE from')
    .replace(/"generatedAt": "[^"]*"/, '"generatedAt": "STAMP"');
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas map determinism', () => {
  it('writes identical bytes at one commit, and only the commit changes after atlas/ is committed', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-bytes-'));
    roots.push(root);
    cpSync(HOST, root, { recursive: true });
    const git = (args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    git(['init']);
    git(['config', 'core.autocrlf', 'false']);
    git(['add', '-A']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'host']);
    const map = () => spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(map().status, 0);
    const first = readFileSync(join(root, 'atlas', 'structure.json'));
    assert.equal(map().status, 0);
    const second = readFileSync(join(root, 'atlas', 'structure.json'));
    assert.equal(Buffer.compare(first, second), 0);
    const left = JSON.parse(readFileSync(join(root, 'atlas', 'statistics.json'), 'utf8'));
    const renders = () => ['README.md', 'page.json'].map((name) => readFileSync(join(root, 'atlas', name), 'utf8'));
    const before = renders();
    assert.equal(map().status, 0);
    const right = JSON.parse(readFileSync(join(root, 'atlas', 'statistics.json'), 'utf8'));
    left.generatedAt = '';
    right.generatedAt = '';
    assert.deepEqual(left, right);
    const after = renders();
    for (let i = 0; i < before.length; i += 1) assert.equal(settle(before[i]), settle(after[i]));
    git(['add', '--', 'atlas']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'map']);
    assert.equal(map().status, 0);
    const third = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
    const committed = JSON.parse(second.toString('utf8'));
    assert.notEqual(third.generatedFrom.commit, committed.generatedFrom.commit);
    committed.generatedFrom.commit = third.generatedFrom.commit;
    assert.deepEqual(third, committed);
  });
});
