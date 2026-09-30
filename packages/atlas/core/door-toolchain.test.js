import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { findingRemedy, findingSentence } from './door-checks.js';
import { makeRepo } from './fixture-repo.js';
import { mapRepository } from './index.js';

/**
 * D1, the toolchain check (docs/atlas-production.spec.md, Part 3 and
 * acceptance 5): a step that runs a tool whose package is in the lock of its
 * directory, reached through npm run scripts as doors are read, in a job
 * that pins a Node version before it in a form known offline, fires when the
 * package's engines.node excludes every version the pin can resolve to. A
 * pin of 20 is any 20.x. No setup step, lts/* and an expression give no
 * finding and are listed unresolved (fixtures/atlas/door-toolchain).
 */

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/door-toolchain');
const root = makeRepo(FIXTURE);
after(() => rmSync(root, { recursive: true, force: true }));

const mapped = mapRepository({
  repoPath: root,
  boundaries: [
    { name: 'site', globs: ['site/**'], role: 'code' },
    { name: 'strict', globs: ['strict/**'], role: 'code' },
    { name: 'pylib', globs: ['pylib/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ],
});
const door = (file) => mapped.doors.find((entry) => entry.file === `.github/workflows/${file}`);
const findings = (file) => door(file).findings ?? [];
const unresolved = (file) => door(file).unresolvedChecks ?? [];

describe('D1 on a Pages door', () => {
  it('fires when the door pins Node 20 and runs astro build with astro 7 in the lock', () => {
    const [finding, ...rest] = findings('pages.yml');
    assert.deepEqual(rest, []);
    assert.deepEqual(finding, {
      rule: 'D1',
      job: 'build',
      step: 'Build',
      tool: 'astro build',
      package: 'astro',
      version: '7.3.3',
      requires: '>=22.12.0',
      pins: ['20'],
      pinnedBy: { step: 'Setup Node', version: '20' },
      refuses: true,
      lines: [
        { file: '.github/workflows/pages.yml', line: 10 },
        { file: '.github/workflows/pages.yml', line: 17 },
        { file: 'site/package-lock.json', line: 9 },
      ],
    });
    assert.equal(findingSentence(door('pages.yml'), finding), 'Deploy site pins Node 20 and runs astro build; astro 7.3.3 requires Node >=22.12.0 and refuses to start.');
    assert.match(findingRemedy(finding), /^pin a Node version astro accepts \(>=22\.12\.0\), or use a release of astro that accepts 20; the start check is in withastro\/astro, packages\/astro\/bin\/astro\.mjs$/);
  });

  it('stays quiet on Node 22, and on 20 against ^20.19.0 || >=22.12.0', () => {
    assert.deepEqual(findings('pages-22.yml'), []);
    assert.deepEqual(unresolved('pages-22.yml'), []);
    assert.deepEqual(findings('preview.yml'), [], 'a pin of 20 is any 20.x, and 20.19 is one');
  });

  it('says only what a tool off the known list declares', () => {
    const [finding] = findings('lint.yml');
    assert.equal(finding.refuses, undefined);
    assert.equal(findingSentence(door('lint.yml'), finding), 'Lint docs pins Node 18 and runs docs-lint; docs-lint 2.0.0 declares Node >=20.');
  });

  it('gives no finding for lts/*, no setup step or an expression, and lists each unresolved', () => {
    for (const [file, why] of [['lts.yml', 'lts/*'], ['bare.yml', 'no setup-node step before it'], ['chosen.yml', 'expression']]) {
      assert.deepEqual(findings(file), [], file);
      assert.deepEqual(unresolved(file).map((entry) => [entry.rule, entry.tool, entry.package, entry.why]), [['D1', 'astro build', 'astro', why]], file);
    }
  });

  it('resolves a node-version-file, and follows cd and npx to the tool', () => {
    const [finding] = findings('from-file.yml');
    assert.deepEqual(finding.pinnedBy, { step: 'Setup Node', versionFile: 'site/.nvmrc' });
    assert.equal(findingSentence(door('from-file.yml'), finding), 'Deploy from file pins Node 20 (from site/.nvmrc) and runs astro build; astro 7.3.3 requires Node >=22.12.0 and refuses to start.');
  });

  it('fires on the legs of a matrix whose pin the tool refuses, and names them', () => {
    const [finding] = findings('matrix.yml');
    assert.deepEqual([finding.pins, finding.legs], [['20'], 2]);
    assert.equal(findingSentence(door('matrix.yml'), finding), 'Matrix pins Node 20 on one leg of its matrix and runs astro build; astro 7.3.3 requires Node >=22.12.0 and refuses to start.');
  });

  it('reads the whole lock when a tracked .npmrc sets engine-strict', () => {
    const [finding] = findings('strict.yml');
    assert.equal(finding.engineStrict, 'strict/.npmrc');
    assert.equal(findingSentence(door('strict.yml'), finding), 'Service pins Node 22 and runs npm ci with engine-strict set in strict/.npmrc; newer-helper 3.1.0 requires Node >=24, so the install refuses.');
  });
});

describe('D1-python, the same rule for a setup-python pin', () => {
  it('fires when the pin is below the requires-python of the package the step installs', () => {
    const [finding] = findings('python.yml');
    assert.equal(finding.rule, 'D1-python');
    assert.deepEqual(finding.lines, [
      { file: '.github/workflows/python.yml', line: 10 },
      { file: '.github/workflows/python.yml', line: 13 },
      { file: 'pylib/pyproject.toml', line: 4 },
    ]);
    assert.equal(findingSentence(door('python.yml'), finding), 'Python pins Python 3.9 and runs pip install; pylib/pyproject.toml requires Python >=3.10.');
    assert.deepEqual(findings('python-ok.yml'), []);
  });
});
