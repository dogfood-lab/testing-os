import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { findingRemedy, findingSentence } from './door-checks.js';
import { makeRepo } from './fixture-repo.js';
import { mapRepository } from './index.js';

/**
 * D2, the lockfile-platform check (docs/atlas-production.spec.md, Part 3 and
 * acceptance 6): a step that runs npm ci or npm install in a directory with
 * a tracked lock, in a job whose platform is known, fires when an entry of
 * the lock lists optional bindings of which at least one is present with its
 * os and cpu, at least one is missing, and none present matches the job's
 * platform. One finding per lock and job, naming the packages
 * (fixtures/atlas/door-lockfile).
 */

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/door-lockfile');
const root = makeRepo(FIXTURE);
after(() => rmSync(root, { recursive: true, force: true }));

const mapped = mapRepository({
  repoPath: root,
  boundaries: [
    { name: 'site', globs: ['site/**'], role: 'code' },
    { name: 'packages', globs: ['complete/**', 'watcher/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ],
});
const door = (file) => mapped.doors.find((entry) => entry.file === `.github/workflows/${file}`);
const findings = (file) => door(file).findings ?? [];

describe('D2 on a lock written on Windows', () => {
  it('fires once for a Linux job running npm ci, naming the six packages', () => {
    const all = findings('pages.yml');
    assert.equal(all.length, 1);
    const [finding] = all;
    assert.deepEqual(finding, {
      rule: 'D2',
      job: 'build',
      step: 'Install',
      tool: 'npm ci',
      lock: 'site/package-lock.json',
      platforms: ['linux-x64'],
      runsOn: ['ubuntu-latest'],
      packages: ['@tailwindcss/oxide', 'esbuild', 'lightningcss', 'rollup', 'satteri', 'sharp'],
      holds: ['win32-x64'],
      lines: [
        { file: '.github/workflows/pages.yml', line: 13 },
        { file: 'site/package-lock.json', line: 39 },
        { file: 'site/package-lock.json', line: 57 },
        { file: 'site/package-lock.json', line: 68 },
      ],
    });
    assert.equal(findingSentence(door('pages.yml'), finding), 'site/package-lock.json holds no linux-x64 binding for @tailwindcss/oxide, esbuild, lightningcss and 3 more (it holds win32-x64 only); Deploy site runs npm ci on ubuntu-latest.');
    assert.equal(findingRemedy(finding), 'rewrite site/package-lock.json with npm 11.3.0 or later, the release that carries the fix for npm/cli issue 4828 (https://github.com/npm/cli/issues/4828)');
  });

  it('stays quiet for a job on windows-latest with the same lock', () => {
    assert.deepEqual(findings('windows.yml'), []);
    assert.deepEqual(door('windows.yml').unresolvedChecks ?? [], []);
  });

  it('fires once per lock and job, for the matrix leg the lock cannot serve', () => {
    const all = findings('matrix.yml');
    assert.equal(all.length, 1, 'two install steps of one job against one lock are one finding');
    assert.deepEqual([all[0].runsOn, all[0].platforms], [['ubuntu-latest'], ['linux-x64']]);
  });

  it('stays quiet on a complete lock, and on one whose only missing child is fsevents', () => {
    assert.deepEqual(findings('complete.yml'), []);
    assert.deepEqual(findings('watcher.yml'), []);
  });

  it('does not judge npm install, which may add the missing binding, and says why', () => {
    // Measured on the fleet, 2026-09-30: a Pages door running `npm install`
    // on ubuntu-latest from a Windows-written lock deployed green three
    // times, so npm install repairs what npm ci installs as written.
    assert.deepEqual(findings('install.yml'), []);
    assert.deepEqual(door('install.yml').unresolvedChecks, [{ rule: 'D2', job: 'build', step: 'Install', lock: 'site/package-lock.json', why: 'npm install may add a missing binding at install time; only npm ci installs the lock as written' }]);
  });

  it('gives no finding on a self-hosted runner, and lists it unresolved', () => {
    assert.deepEqual(findings('own.yml'), []);
    assert.deepEqual(door('own.yml').unresolvedChecks, [{ rule: 'D2', job: 'build', step: 'Install', lock: 'site/package-lock.json', runsOn: ['self-hosted', 'linux'], why: 'self-hosted' }]);
  });
});
