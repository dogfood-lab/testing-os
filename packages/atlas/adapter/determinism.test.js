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

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas map determinism', () => {
  it('writes identical bytes on two runs at one commit', () => {
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
  });
});
