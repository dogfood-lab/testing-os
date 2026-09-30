import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { repositoryView } from './commands.js';
import { makeRepo } from './fixture-repo.js';
import { lockFor, lockPackages, optionalBindings, packageByBin, packageByName, readLock } from './lockfile.js';
import { storedText } from './text.js';

/**
 * The lockfile reader behind the door checks (docs/atlas-production.spec.md,
 * Part 3): a tracked package-lock.json of version 2 or 3, read as git stores
 * it, answers what a package a directory resolves declares (engines, bin) and
 * which optional children each entry that lists them has, with their systems.
 * Any other lock is unresolved, with why (fixtures/atlas/lockfile-reader).
 */

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/lockfile-reader');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function view(root) {
  const tracked = new Set(['package.json', 'package-lock.json', 'site/package.json', 'legacy/package.json', 'legacy/package-lock.json', 'old/package-lock.json', 'broken/package-lock.json', 'README.md']);
  return repositoryView({ repoPath: root, tracked });
}

const root = makeRepo(FIXTURE);
roots.push(root);
const repo = view(root);

describe('the lock a directory installs from', () => {
  it('is the nearest tracked package-lock.json at or above it', () => {
    const found = lockFor(repo, 'site');
    assert.equal(found.path, 'package-lock.json');
    assert.equal(found.within, 'site');
    assert.equal(found.lock.version, 3);
    assert.equal(lockFor(repo, 'legacy').path, 'legacy/package-lock.json');
    assert.equal(lockFor({ tracked: new Set(), text: () => null }, 'site'), null);
  });

  it('is unresolved, with why, when it is another version or does not parse', () => {
    assert.deepEqual(lockFor(repo, 'old').lock, { ok: false, unresolved: 'lockfileVersion 1' });
    assert.deepEqual(lockFor(repo, 'broken').lock, { ok: false, unresolved: 'does not parse' });
  });
});

describe('a package by name or by the command it links', () => {
  const { lock } = lockFor(repo, '');

  it('names the engines and bin of the package a directory resolves, with its line', () => {
    const astro = packageByName(lock, 'site', 'astro');
    assert.deepEqual(astro, { key: 'node_modules/astro', name: 'astro', version: '7.3.3', engines: { node: '>=22.12.0', npm: '>=9.6.5' }, bin: ['astro'], line: 22 });
    assert.equal(packageByName(lock, '', 'vite'), null, 'the root does not see a package installed under a member');
    assert.equal(packageByName(lock, 'site', 'vite').key, 'site/node_modules/vite');
  });

  it('finds the package whose bin a command runs, the nearest first', () => {
    assert.equal(packageByBin(lock, 'site', 'vite').name, 'vite');
    assert.equal(packageByBin(lock, 'site', 'astro').name, 'astro');
    assert.equal(packageByBin(lock, '', 'esbuild').key, 'node_modules/esbuild');
    assert.equal(packageByBin(lock, '', 'no-such-tool'), null);
  });

  it('reads a lockfileVersion 2 lock by its packages section', () => {
    const legacy = lockFor(repo, 'legacy').lock;
    assert.equal(legacy.version, 2);
    assert.deepEqual(packageByBin(legacy, '', 'next').engines, { node: '^18.18.0 || ^19.8.0 || >= 20.0.0' });
  });

  it('lists every package but the root and the links', () => {
    assert.deepEqual(lockPackages(lock).map((entry) => entry.key), [
      'node_modules/@esbuild/win32-x64', 'node_modules/astro', 'node_modules/esbuild', 'node_modules/older-bundler',
      'node_modules/older-bundler/node_modules/@esbuild/linux-x64', 'node_modules/older-bundler/node_modules/esbuild', 'site', 'site/node_modules/vite',
    ]);
  });
});

describe('the optional children an entry lists', () => {
  const { lock } = lockFor(repo, '');

  it('says which the lock holds, each with its systems, resolved as Node resolves them', () => {
    assert.deepEqual(optionalBindings(lock), [
      {
        key: 'node_modules/esbuild',
        name: 'esbuild',
        version: '0.25.10',
        line: 32,
        children: [
          { name: '@esbuild/darwin-arm64', present: false },
          { name: '@esbuild/linux-x64', present: false },
          { name: '@esbuild/win32-x64', present: true, key: 'node_modules/@esbuild/win32-x64', os: ['win32'], cpu: ['x64'] },
        ],
      },
      {
        key: 'node_modules/older-bundler/node_modules/esbuild',
        name: 'esbuild',
        version: '0.18.20',
        line: 59,
        children: [
          { name: '@esbuild/linux-x64', present: true, key: 'node_modules/older-bundler/node_modules/@esbuild/linux-x64', os: ['linux'], cpu: ['x64'] },
          { name: '@esbuild/win32-x64', present: true, key: 'node_modules/@esbuild/win32-x64', os: ['win32'], cpu: ['x64'] },
        ],
      },
    ]);
  });
});

describe('a lock read as git stores it', () => {
  it('reads the same packages and lines from a CRLF checkout', () => {
    const crlf = makeRepo(FIXTURE);
    roots.push(crlf);
    const path = join(crlf, 'package-lock.json');
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('\n', '\r\n'));
    const { lock } = lockFor(view(crlf), '');
    const plain = readLock(storedText(readFileSync(join(root, 'package-lock.json'), 'utf8')));
    assert.deepEqual([...lock.lines], [...plain.lines]);
    assert.deepEqual(optionalBindings(lock), optionalBindings(plain));
  });
});
