import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';

const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
}

describe('entry points', () => {
  it('uses package.json targets, otherwise the first root name, and the shallowest common directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-entries-'));
    roots.push(root);
    write(root, 'pkg/package.json', '{"main":"./index.js","bin":{"pkg":"./cli.js"},"exports":{".":"./index.js"}}\n');
    write(root, 'pkg/index.js', 'export const pkg = 1;\n');
    write(root, 'pkg/cli.js', 'export const bin = 1;\n');
    write(root, 'other/index.js', 'export const other = 1;\n');
    write(root, 'wide/a/x.js', 'export const x = 1;\n');
    write(root, 'wide/b/y.js', 'export const y = 1;\n');
    const git = (args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    git(['init']);
    git(['add', '-A']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'entries']);
    const result = mapRepository({
      repoPath: root,
      boundaries: [
        { name: 'pkg', globs: ['pkg/**'], status: 'accepted', role: 'code' },
        { name: 'other', globs: ['other/**'], status: 'accepted', role: 'code' },
        { name: 'wide', globs: ['wide/a/**', 'wide/b/**'], status: 'accepted', role: 'code' },
      ],
    });
    const byName = Object.fromEntries(result.boundaries.map((boundary) => [boundary.name, boundary.entryPoints]));
    assert.deepEqual(byName.pkg, ['pkg/cli.js', 'pkg/index.js']);
    assert.deepEqual(byName.other, ['other/index.js']);
    assert.deepEqual(byName.wide, []);
  });

  it('maps a dist entry point onto the tracked source in the build-output fixture', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-entries-'));
    roots.push(root);
    const source = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/build-output/one');
    cpSync(source, root, { recursive: true });
    const git = (args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    git(['init']);
    git(['add', '-A']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'one']);
    const result = mapRepository({
      repoPath: root,
      boundaries: [{ name: 'one', globs: ['**'], status: 'proposed', role: 'code' }],
    });
    assert.deepEqual(result.boundaries[0].entryPoints, ['src/index.ts']);
  });
});
