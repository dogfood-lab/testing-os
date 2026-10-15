import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { declaredDependency, npmPurl, readPnpmLock, resolvedVersion } from './package-facts.js';

// docs/atlas-buildup.spec.md, slice AO: a package's purl, a declared
// dependency's kind, and the version a tracked lockfile resolves it to,
// never what is installed. The lockfiles here are written as npm and pnpm
// write them.

// A repository as the engine views it: its tracked files and their text.
function repoOf(files) {
  return { tracked: new Set(Object.keys(files)), text: (path) => files[path] ?? null };
}

const NPM_LOCK = JSON.stringify({
  name: 'root',
  lockfileVersion: 3,
  packages: {
    '': { name: 'root', dependencies: { lodash: '^4.17.0', 'left-pad': 'npm:pad-left@^1.0.0' } },
    'node_modules/lodash': { version: '4.17.21' },
    'node_modules/left-pad': { name: 'pad-left', version: '1.3.0' },
    'node_modules/@scope/util': { version: '2.0.1' },
    'node_modules/fromgit': { name: '@o/fromgit', version: '0.0.0-development', resolved: 'git+ssh://git@github.com/o/fromgit.git#7269cd539b20907743601f66812b3d904d43508e' },
    'node_modules/unpinned': { version: '1.0.0', resolved: 'git+ssh://git@github.com/o/unpinned.git#main' },
    'packages/app/node_modules/lodash': { version: '3.10.1' },
    'node_modules/app': { resolved: 'packages/app', link: true },
    'packages/app': { name: 'app', version: '0.1.0' },
  },
});

const PNPM_V9 = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      react:
        specifier: ^18.2.0
        version: 18.3.1
      react-dom:
        specifier: ^18.2.0
        version: 18.3.1(react@18.3.1)
    devDependencies:
      left-pad:
        specifier: npm:pad-left@^1.0.0
        version: pad-left@1.3.0

  packages/ui:
    dependencies:
      shared:
        specifier: workspace:*
        version: link:../shared
      zod:
        specifier: ^3.22.0
        version: 3.23.8
`;

const PNPM_V6_SINGLE = `lockfileVersion: '6.0'

dependencies:
  express:
    specifier: ^4.18.0
    version: 4.19.2
`;

describe('a package\'s purl', () => {
  it('is pkg:npm/name, with a scope as %40scope, and no version', () => {
    assert.equal(npmPurl('lodash'), 'pkg:npm/lodash');
    assert.equal(npmPurl('@angular/animation'), 'pkg:npm/%40angular/animation');
    assert.equal(npmPurl('JSONStream'), 'pkg:npm/JSONStream', 'a legacy name keeps its case, as the registry does');
  });
});

describe('a declared dependency', () => {
  it('is a registry package for a range or a tag', () => {
    for (const range of ['^4.17.0', '~1.2.3', '>=1 <2', '*', '', 'latest', '1.x']) {
      assert.deepEqual(declaredDependency('lodash', range), { name: 'lodash', purl: 'pkg:npm/lodash', range, kind: 'registry' }, range);
    }
  });

  it('is its own kind when it moves with the tree, or names no registry package', () => {
    for (const [range, kind] of [
      ['workspace:*', 'workspace'], ['workspace:^1.0.0', 'workspace'], ['file:../shared', 'file'], ['link:../shared', 'link'], ['portal:../shared', 'link'],
      ['github:o/r', 'git'], ['git+https://github.com/o/r.git', 'git'], ['git://github.com/o/r.git#v1', 'git'], ['o/r', 'git'], ['o/r#main', 'git'],
      ['https://example.com/r.tgz', 'url'],
    ]) assert.equal(declaredDependency('x', range).kind, kind, range);
  });

  it('is the package an alias names, with the alias kept beside it', () => {
    assert.deepEqual(declaredDependency('left-pad', 'npm:pad-left@^1.0.0'), { name: 'pad-left', purl: 'pkg:npm/pad-left', range: '^1.0.0', kind: 'registry', alias: 'left-pad' });
    assert.deepEqual(declaredDependency('ui', 'npm:@scope/ui@2.x'), { name: '@scope/ui', purl: 'pkg:npm/%40scope/ui', range: '2.x', kind: 'registry', alias: 'ui' });
  });
});

describe('a pnpm-lock.yaml', () => {
  it('gives each importer\'s dependencies, from version 9 and from a single-project version 6', () => {
    const v9 = readPnpmLock(PNPM_V9);
    assert.equal(v9.ok, true);
    assert.deepEqual([...v9.importers.keys()], ['.', 'packages/ui']);
    assert.deepEqual(v9.importers.get('packages/ui').get('zod'), { specifier: '^3.22.0', version: '3.23.8' });
    const v6 = readPnpmLock(PNPM_V6_SINGLE);
    assert.deepEqual(v6.importers.get('.').get('express'), { specifier: '^4.18.0', version: '4.19.2' });
  });

  it('is unresolved, with why, for a version it does not read or text that does not parse', () => {
    assert.deepEqual(readPnpmLock("lockfileVersion: 5.4\nspecifiers:\n  a: ^1\n"), { ok: false, unresolved: 'lockfileVersion 5.4' });
    assert.deepEqual(readPnpmLock('lockfileVersion: [unclosed'), { ok: false, unresolved: 'does not parse' });
  });
});

describe('the version a lockfile resolves', () => {
  it('is the one package-lock.json installs where the manifest is, an alias under its own name', () => {
    const repo = repoOf({ 'package-lock.json': NPM_LOCK, 'package.json': '{}', 'packages/app/package.json': '{}' });
    assert.deepEqual(resolvedVersion(repo, '', declaredDependency('lodash', '^4.17.0')), { version: '4.17.21', from: 'package-lock.json' });
    assert.deepEqual(resolvedVersion(repo, 'packages/app', declaredDependency('lodash', '^3.0.0')), { version: '3.10.1', from: 'package-lock.json' }, 'Node\'s lookup: the member\'s own node_modules first');
    assert.deepEqual(resolvedVersion(repo, 'packages/app', declaredDependency('@scope/util', '^2.0.0')), { version: '2.0.1', from: 'package-lock.json' }, 'then the directories above');
    assert.deepEqual(resolvedVersion(repo, '', declaredDependency('left-pad', 'npm:pad-left@^1.0.0')), { version: '1.3.0', from: 'package-lock.json' });
  });

  it('is the one pnpm-lock.yaml gives the manifest\'s importer, with no peer suffix and no alias prefix', () => {
    const repo = repoOf({ 'pnpm-lock.yaml': PNPM_V9 });
    assert.deepEqual(resolvedVersion(repo, '', declaredDependency('react-dom', '^18.2.0')), { version: '18.3.1', from: 'pnpm-lock.yaml' });
    assert.deepEqual(resolvedVersion(repo, '', declaredDependency('left-pad', 'npm:pad-left@^1.0.0')), { version: '1.3.0', from: 'pnpm-lock.yaml' });
    assert.deepEqual(resolvedVersion(repo, 'packages/ui', declaredDependency('zod', '^3.22.0')), { version: '3.23.8', from: 'pnpm-lock.yaml' });
  });

  it('is none for a dependency that moves with the tree, or a lock entry that is not a version', () => {
    const npm = repoOf({ 'package-lock.json': NPM_LOCK });
    assert.deepEqual(resolvedVersion(npm, '', declaredDependency('app', 'file:packages/app')), { version: null, unknown: 'a file dependency moves with the tree' });
    assert.deepEqual(resolvedVersion(npm, '', declaredDependency('app', '^0.1.0')), { version: null, unknown: 'package-lock.json links app from packages/app', linked: true },
      'npm workspaces declare a sibling with a plain range and link it from the tree');
    assert.deepEqual(resolvedVersion(npm, '', declaredDependency('fromgit', 'github:o/fromgit')),
      { version: '7269cd539b20907743601f66812b3d904d43508e', from: 'package-lock.json', realName: '@o/fromgit' },
      'a git dependency is the commit the lock pins, and the package that commit holds');
    assert.deepEqual(resolvedVersion(npm, '', declaredDependency('unpinned', 'github:o/unpinned#main')),
      { version: null, unknown: 'package-lock.json pins git+ssh://git@github.com/o/unpinned.git#main, not a commit' });
    // As ai-jam-sessions' pnpm-lock.yaml holds vocal-synth-engine (2026-10-13).
    const gitPinned = repoOf({ 'pnpm-lock.yaml': `${PNPM_V9}      vocal-synth-engine:
        specifier: github:o/vocal-synth-engine#7269cd539b20907743601f66812b3d904d43508e
        version: '@o/vocal-synth-engine@https://codeload.github.com/o/vocal-synth-engine/tar.gz/7269cd539b20907743601f66812b3d904d43508e'
` });
    assert.deepEqual(resolvedVersion(gitPinned, 'packages/ui', declaredDependency('vocal-synth-engine', 'github:o/vocal-synth-engine#7269cd539b20907743601f66812b3d904d43508e')),
      { version: '7269cd539b20907743601f66812b3d904d43508e', from: 'pnpm-lock.yaml', realName: '@o/vocal-synth-engine' });
    assert.deepEqual(resolvedVersion(npm, '', declaredDependency('tarball', 'https://example.com/t.tgz')), { version: null, unknown: 'a tarball URL names no version' });
    const pnpm = repoOf({ 'pnpm-lock.yaml': PNPM_V9 });
    assert.deepEqual(resolvedVersion(pnpm, 'packages/ui', declaredDependency('shared', 'workspace:*')), { version: null, unknown: 'a workspace dependency moves with the tree' });
  });

  it('is unknown, with the reason, where no lock here can say', () => {
    const cases = [
      [{}, '', 'no lockfile'],
      [{ 'yarn.lock': '' }, '', 'yarn.lock is not read'],
      [{ 'npm-shrinkwrap.json': '{}', 'package-lock.json': NPM_LOCK }, '', 'npm-shrinkwrap.json is not read'],
      [{ 'package-lock.json': JSON.stringify({ lockfileVersion: 1, dependencies: {} }) }, '', 'package-lock.json: lockfileVersion 1'],
      [{ 'pnpm-lock.yaml': 'lockfileVersion: 5.4\n' }, '', 'pnpm-lock.yaml: lockfileVersion 5.4'],
      [{ 'package-lock.json': NPM_LOCK }, '', 'package-lock.json holds no absent for the root'],
      [{ 'pnpm-lock.yaml': PNPM_V9 }, 'packages/ui', 'pnpm-lock.yaml holds no absent for packages/ui'],
      [{ 'pnpm-lock.yaml': PNPM_V9 }, 'fixtures/demo', 'pnpm-lock.yaml does not install fixtures/demo'],
      [{ 'package-lock.json': NPM_LOCK }, 'fixtures/demo', 'package-lock.json does not install fixtures/demo'],
    ];
    for (const [files, dir, unknown] of cases) {
      assert.deepEqual(resolvedVersion(repoOf(files), dir, declaredDependency('absent', '^1.0.0')), { version: null, unknown }, unknown);
    }
  });

  it('is read from the nearest directory that holds a lock, a member\'s own lock before the root\'s', () => {
    const repo = repoOf({ 'package-lock.json': NPM_LOCK, 'tools/pnpm-lock.yaml': PNPM_V6_SINGLE });
    assert.deepEqual(resolvedVersion(repo, 'tools', declaredDependency('express', '^4.18.0')), { version: '4.19.2', from: 'tools/pnpm-lock.yaml' });
  });
});
