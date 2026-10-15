import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { isValidPackageName } from '../core/package-facts.js';
import { mappedRepository } from '../sidecar/test-client.js';

// docs/atlas-buildup.spec.md, slice AO: the map records the repository's own
// package facts in structure.json: every manifest with its role, every
// declaration with its purl, kind and locked version, what a door publishes,
// and the packages each JavaScript or TypeScript file imports. These map two
// fixtures with atlas map, as a repository is mapped, and read what it wrote.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const COMMIT = '7269cd539b20907743601f66812b3d904d43508e';
const roots = [];
let npm;
let pnpm;
let publishes;
let aliases;
let aliasStatistics;

before(() => {
  const aliasRoot = mappedRepository(join(FIXTURES, 'package-facts-aliases'), { prefix: 'atlas-package-facts-aliases-' });
  roots.push(aliasRoot);
  aliases = JSON.parse(readFileSync(join(aliasRoot, 'atlas', 'structure.json'), 'utf8'));
  aliasStatistics = JSON.parse(readFileSync(join(aliasRoot, 'atlas', 'statistics.json'), 'utf8'));
  npm = structureOf(mappedRepository(join(FIXTURES, 'package-facts'), { prefix: 'atlas-package-facts-' }));
  pnpm = structureOf(mappedRepository(join(FIXTURES, 'package-facts-pnpm'), { prefix: 'atlas-package-facts-pnpm-' }));
  publishes = structureOf(mappedRepository(join(FIXTURES, 'package-facts-publishes'), { prefix: 'atlas-package-facts-publishes-' }));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function structureOf(root) {
  roots.push(root);
  return JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
}

function fileIn(structure, path) {
  return [...structure.boundaries.flatMap((boundary) => boundary.files), ...structure.unassigned].find((file) => file.path === path);
}

describe('the manifests', () => {
  it('are every package.json, each with one role and how it was known', () => {
    assert.deepEqual(npm.manifests.map((manifest) => [manifest.path, manifest.role, manifest.roleFrom]), [
      ['fixtures/demo/package.json', 'other', 'no workspace lists it and no install step Atlas reads runs in its directory'],
      ['package.json', 'root', 'the root manifest'],
      ['packages/lib/package.json', 'member', 'workspaces in package.json'],
      ['packages/private-tool/package.json', 'member', 'workspaces in package.json'],
      ['packages/util/package.json', 'member', 'workspaces in package.json'],
      ['tools/docs/package.json', 'installed', 'door Site, job build, step Install docs dependencies: npm install in tools/docs'],
      ['tools/site/package.json', 'installed', 'door Site, job build, step Install site dependencies: npm ci in tools/site'],
      ['tools/web/package.json', 'installed', 'door Site, job build, step Install web dependencies: npm ci in tools/web'],
    ], 'working-directory, cd x && and --prefix each name where a step installs');
    assert.deepEqual(pnpm.manifests.map((manifest) => [manifest.path, manifest.role, manifest.roleFrom]), [
      ['package.json', 'root', 'the root manifest'],
      ['packages/shared/package.json', 'member', 'packages in pnpm-workspace.yaml'],
      ['packages/ui/package.json', 'member', 'packages in pnpm-workspace.yaml'],
    ]);
  });

  it('say only what Atlas read when no role fits', () => {
    // backpropagate, in the fleet check of 2026-10-13: a release step copies
    // its tools' manifest to a sandbox and installs there, so "no door
    // installs from it" was false, though no install runs in its directory.
    const tools = publishes.manifests.find((manifest) => manifest.path === 'tools/release/package.json');
    assert.deepEqual([tools.role, tools.roleFrom], ['other', 'no workspace lists it and no install step Atlas reads runs in its directory']);
  });

  it('carry the name, version and private flag each states', () => {
    const lib = npm.manifests.find((manifest) => manifest.path === 'packages/lib/package.json');
    assert.deepEqual([lib.name, lib.version, lib.private], ['@fx/lib', '1.2.0', undefined]);
    assert.equal(npm.manifests.find((manifest) => manifest.path === 'packages/private-tool/package.json').private, true);
  });
});

describe('the declared dependencies', () => {
  it('are every declaration with its purl, kind and what the lock records of it', () => {
    const shown = npm.packageDependencies.map((entry) => ({ ...entry }));
    assert.deepEqual(shown, [
      { field: 'dependencies', kind: 'registry', manifest: 'fixtures/demo/package.json', name: 'lodash', purl: 'pkg:npm/lodash', range: '^4.0.0', unknown: 'package-lock.json does not install fixtures/demo', version: null },
      { field: 'dependencies', kind: 'registry', manifest: 'package.json', name: 'events', purl: 'pkg:npm/events', range: '^3.3.0', version: '3.3.0', versionFrom: 'package-lock.json' },
      { alias: 'left-pad', field: 'dependencies', kind: 'registry', manifest: 'package.json', name: 'pad-left', purl: 'pkg:npm/pad-left', range: '^1.0.0', version: '1.3.0', versionFrom: 'package-lock.json' },
      { field: 'dependencies', kind: 'registry', manifest: 'package.json', name: 'lodash', purl: 'pkg:npm/lodash', range: '^4.17.0', version: '4.17.21', versionFrom: 'package-lock.json' },
      { field: 'dependencies', kind: 'url', manifest: 'package.json', name: 'tarball', purl: 'pkg:npm/tarball', range: 'https://example.com/tarball-1.0.0.tgz', unknown: 'a tarball URL names no version', version: null },
      { alias: 'vse', field: 'dependencies', kind: 'git', manifest: 'package.json', name: '@fx/vse', purl: 'pkg:npm/%40fx/vse', range: `github:fx/vse#${COMMIT}`, repository: 'https://github.com/fx/vse', version: COMMIT, versionFrom: 'package-lock.json' },
      { field: 'devDependencies', kind: 'registry', manifest: 'package.json', name: 'typescript', purl: 'pkg:npm/typescript', range: '^5.4.0', version: '5.4.5', versionFrom: 'package-lock.json' },
      { field: 'dependencies', kind: 'workspace', kindFrom: 'the lockfile links it from the tree', manifest: 'packages/lib/package.json', name: '@fx/util', purl: 'pkg:npm/%40fx/util', range: '^1.0.0', unknown: 'package-lock.json links @fx/util from packages/util', version: null },
      { field: 'dependencies', kind: 'registry', manifest: 'packages/lib/package.json', name: 'lodash', purl: 'pkg:npm/lodash', range: '^3.10.0', version: '3.10.1', versionFrom: 'package-lock.json' },
      { field: 'dependencies', kind: 'registry', manifest: 'tools/site/package.json', name: 'vite', purl: 'pkg:npm/vite', range: '^5.0.0', version: '5.2.0', versionFrom: 'tools/site/package-lock.json' },
    ]);
  });

  it('read pnpm-lock.yaml by importer, a git dependency as the package its commit holds', () => {
    assert.deepEqual(pnpm.packageDependencies, [
      { field: 'dependencies', kind: 'registry', manifest: 'package.json', name: 'react-dom', purl: 'pkg:npm/react-dom', range: '^18.2.0', version: '18.3.1', versionFrom: 'pnpm-lock.yaml' },
      { alias: 'vocal-synth-engine', field: 'dependencies', kind: 'git', manifest: 'package.json', name: '@px/vocal-synth-engine', purl: 'pkg:npm/%40px/vocal-synth-engine', range: `github:px/vocal-synth-engine#${COMMIT}`, repository: 'https://github.com/px/vocal-synth-engine', version: COMMIT, versionFrom: 'pnpm-lock.yaml' },
      { field: 'dependencies', kind: 'workspace', manifest: 'packages/ui/package.json', name: '@px/shared', purl: 'pkg:npm/%40px/shared', range: 'workspace:*', unknown: 'a workspace dependency moves with the tree', version: null },
      { field: 'dependencies', kind: 'registry', manifest: 'packages/ui/package.json', name: 'zod', purl: 'pkg:npm/zod', range: '^3.22.0', version: '3.23.8', versionFrom: 'pnpm-lock.yaml' },
    ]);
  });
});

describe('what a door publishes', () => {
  it('is each non-private manifest it sends to npm, with its version and repository', () => {
    assert.deepEqual(npm.packagesPublished, [
      { doors: ['Release'], how: 'every member of the workspace', manifest: 'packages/lib/package.json', name: '@fx/lib', purl: 'pkg:npm/%40fx/lib', repository: 'https://github.com/fx/lib', version: '1.2.0' },
      { doors: ['Release'], how: 'every member of the workspace', manifest: 'packages/util/package.json', name: '@fx/util', purl: 'pkg:npm/%40fx/util', repository: 'https://github.com/fx/util', version: '1.0.0' },
    ], 'npm publish --workspaces sends every member but the private one');
    assert.deepEqual(pnpm.packagesPublished, [
      { doors: ['CI'], how: 'named by the publish', manifest: 'packages/ui/package.json', name: '@px/ui', purl: 'pkg:npm/%40px/ui', repository: 'https://github.com/px/px', version: '2.0.0' },
    ]);
  });

  it('counts a publish an if: holds, and says how a loop or the tag found its packages', () => {
    // The fleet check of 2026-10-13: a publish in a job an if: holds to an
    // event was left out (role-os, housekeeping and eight more), a loop over
    // a glob was said to name what it finds (motif), and a publish of one
    // directory the tag picks was said to send every package (sprite-foundry-packs).
    assert.deepEqual(publishes.packagesPublished, [
      { doors: ['Release'], how: 'named by the publish', manifest: 'cli/package.json', name: '@pb/cli', purl: 'pkg:npm/%40pb/cli', repository: 'https://github.com/pb/pb', version: '3.1.0' },
      { doors: ['Release'], how: 'a loop over plugins/*/', manifest: 'plugins/alpha/package.json', name: '@pb/alpha', purl: 'pkg:npm/%40pb/alpha', repository: null, version: '1.0.0' },
      { doors: ['Release'], how: 'a loop over plugins/*/', manifest: 'plugins/beta/package.json', name: '@pb/beta', purl: 'pkg:npm/%40pb/beta', repository: null, version: '1.1.0' },
      { doors: ['Release'], how: 'one package under themes/, chosen by the tag', manifest: 'themes/dark/package.json', name: '@pb/theme-dark', purl: 'pkg:npm/%40pb/theme-dark', repository: null, version: '0.2.0' },
      { doors: ['Release'], how: 'one package under themes/, chosen by the tag', manifest: 'themes/light/package.json', name: '@pb/theme-light', purl: 'pkg:npm/%40pb/theme-light', repository: null, version: '0.3.0' },
    ], 'the private plugin is left out, as npm refuses it');
  });
});

describe('the packages a file imports', () => {
  it('are its bare imports, each with the manifest whose declaration covers it', () => {
    assert.deepEqual(fileIn(npm, 'packages/lib/index.js').packages, [
      { manifest: 'packages/lib/package.json', purl: 'pkg:npm/%40fx/lib', self: true },
      { manifest: 'packages/lib/package.json', purl: 'pkg:npm/%40fx/util' },
      { manifest: 'packages/lib/package.json', purl: 'pkg:npm/lodash' },
      { manifest: 'package.json', purl: 'pkg:npm/pad-left' },
      { manifest: null, purl: 'pkg:npm/undeclared-pkg' },
    ], 'lodash/fp counts against lodash; node:fs, fs/promises, events, astro:content and require.resolve are no package');
    assert.deepEqual(fileIn(pnpm, 'packages/ui/index.ts').packages, [
      { manifest: 'packages/ui/package.json', purl: 'pkg:npm/%40px/shared' },
      { manifest: 'package.json', purl: 'pkg:npm/%40px/vocal-synth-engine' },
      { manifest: 'package.json', purl: 'pkg:npm/react-dom' },
      { manifest: 'packages/ui/package.json', purl: 'pkg:npm/zod' },
    ], 'a git dependency is imported as the package its commit holds');
    assert.equal(fileIn(npm, 'packages/util/index.js').packages, undefined, 'a file that imports no package carries no list');
  });

  // R&D's review of #173: a path alias, a package's own `#` import and a
  // SvelteKit `$lib` look like bare names. Left in, `@/lib` became
  // pkg:npm/%40/lib, a package every repository with that alias would share,
  // and AP and AQ join repositories on the purl.
  it('leave out a path alias, a # import and a name npm rejects, and count them', () => {
    const main = fileIn(aliases, 'src/main.ts');
    assert.deepEqual(main.importsFiles, ['src/lib/util.js'], 'the aliases that resolve are still file edges');
    assert.deepEqual(main.packages, [
      { manifest: 'package.json', purl: 'pkg:npm/JSONStream' },
      { manifest: 'package.json', purl: 'pkg:npm/lodash' },
    ], '@/lib/util, #internal/util, $lib/unreached and the undeclared alias shared/util are no package; JSONStream is one');
    assert.deepEqual(aliasStatistics.packageImports, {
      filesWithLeftOutImports: 1,
      importSitesNotPackageNames: 2,
      importSitesPackageInternal: 1,
      importSitesResolvedInRepository: 1,
      namesLeftOut: { '#internal': 1, $lib: 1, '@/lib': 1, shared: 1 },
      namesLeftOutOmitted: 0,
    });
  });
});

describe('isValidPackageName', () => {
  it('follows npm\'s rules for packages that exist: capitals pass, an empty scope or a $ does not', () => {
    for (const name of ['react', 'JSONStream', '@types/node', '@scope/pkg', 'a.b', 'pad-left']) assert.equal(isValidPackageName(name), true, name);
    for (const name of ['', '@/lib', '$lib', '.hidden', '_private', '@scope/.x', '@scope', 'a b', 'it(s)', '#internal', '@']) assert.equal(isValidPackageName(name), false, name);
  });
});

describe('the built-ins a map is made with', () => {
  it('are the engine\'s own list, whatever the Node that runs the map lists', () => {
    // R&D's ruling on AO: the map records whether an import is a package, so
    // a list that moved with the running Node would make one commit map
    // differently on two machines. A preload makes the running Node list
    // lodash and the undeclared undeclared-pkg as built-ins and drop events:
    // read from that list, the import of undeclared-pkg would stop being
    // unresolved and lodash would stop being a package. The map must not change.
    const root = mappedRepository(join(FIXTURES, 'package-facts'), { prefix: 'atlas-package-facts-builtins-' });
    roots.push(root);
    const preload = join(mkdtempSync(join(tmpdir(), 'atlas-builtins-preload-')), 'perturb.cjs');
    roots.push(resolve(preload, '..'));
    writeFileSync(preload, [
      "const m = require('node:module');",
      "const list = [...m.builtinModules.filter((name) => name !== 'events'), 'lodash', 'undeclared-pkg'];",
      "Object.defineProperty(m, 'builtinModules', { value: Object.freeze(list), configurable: true, enumerable: true, writable: false });",
      'm.syncBuiltinESMExports();',
      '',
    ].join('\n'));
    // Both maps are made at one commit: mappedRepository committed its map,
    // so the first is made again here before the second.
    const plain = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(plain.status, 0, plain.stdout + plain.stderr);
    const before = readFileSync(join(root, 'atlas', 'structure.json'));
    const perturbed = spawnSync(process.execPath, ['--require', preload, CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(perturbed.status, 0, perturbed.stdout + perturbed.stderr);
    assert.equal(Buffer.compare(before, readFileSync(join(root, 'atlas', 'structure.json'))), 0);
  });
});
