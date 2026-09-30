import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { makeRepo } from './fixture-repo.js';
import { mapRepository } from './index.js';
import { nodeRange, pep440Range, platformOf, pythonRange } from './runtime.js';

/**
 * The runtime of a door (docs/atlas-production.spec.md, Part 2): each job of
 * a workflow door records, basis declared, the runner labels it asks for per
 * leg of a literal matrix and the platform they mean, the environment it
 * names, and each setup-node and setup-python pin with the range it can
 * resolve to offline; each command records the directory it starts in. What
 * only a run can know is recorded unresolved, with why (fixtures/atlas/door-runtime).
 */

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/door-runtime');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const map = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'], role: 'code' }] });
  return buildArtifact(map, '0'.repeat(40));
}

const artifact = mapped();
const door = (file) => artifact.doors.find((entry) => entry.file === `.github/workflows/${file}`);
const job = (file, name) => door(file).jobs.find((entry) => entry.name === name);

describe('the runtime a workflow job declares', () => {
  it('records a leg per runner of a literal matrix, each with the platform its label means', () => {
    const test = job('ci.yml', 'test');
    assert.equal(test.basis, 'declared');
    assert.deepEqual(test.runsOn, [
      { labels: ['ubuntu-latest'], platform: { cpu: 'x64', libc: 'glibc', os: 'linux' } },
      { labels: ['windows-latest'], platform: { cpu: 'x64', os: 'win32' } },
      { labels: ['macos-14'], platform: { cpu: 'arm64', os: 'darwin' } },
    ]);
  });

  it('pins each Node version of a literal matrix as written, 22.10 not 22.1', () => {
    assert.deepEqual(job('ci.yml', 'test').setup, [{
      ranges: [{ from: '20', range: '>=20.0.0 <21.0.0-0' }, { from: '22.10', range: '>=22.10.0 <22.11.0-0' }],
      step: '1',
      uses: 'actions/setup-node',
      version: '${{ matrix.node }}',
    }]);
  });

  it('reads a version file for what it says, and names an environment in its mapping form', () => {
    const build = job('pages.yml', 'build');
    assert.deepEqual(build.setup, [{ fileSays: '22.12', ranges: [{ from: '22.12', range: '>=22.12.0 <22.13.0-0' }], step: 'Setup Node', uses: 'actions/setup-node', versionFile: '.nvmrc' }]);
    const deploy = job('pages.yml', 'deploy');
    assert.deepEqual(deploy.environment, { name: 'github-pages' });
    assert.deepEqual(deploy.runsOn, [{ labels: ['ubuntu-24.04-arm'], platform: { cpu: 'arm64', libc: 'glibc', os: 'linux' } }]);
    assert.equal(deploy.setup, undefined, 'a job with no setup step pins nothing');
  });

  it('leaves an expression, a container and a self-hosted runner unresolved', () => {
    const chosen = job('other.yml', 'chosen');
    assert.deepEqual(chosen.runsOn, [{ labels: ['${{ inputs.runner }}'], unresolved: 'expression' }]);
    assert.deepEqual(chosen.environment, { unresolved: 'expression' });
    assert.deepEqual(chosen.setup, [{ step: '0', unresolved: 'lts/*', uses: 'actions/setup-node', version: 'lts/*' }]);
    const boxed = job('other.yml', 'boxed');
    assert.deepEqual(boxed.runsOn, [{ labels: ['ubuntu-latest'], unresolved: 'container' }]);
    assert.deepEqual(boxed.environment, { name: 'staging' });
    assert.deepEqual(job('other.yml', 'own').runsOn, [{ labels: ['self-hosted', 'linux', 'x64'], unresolved: 'self-hosted' }]);
  });

  it('reads package.json and pyproject.toml as version files, and lets node-version win over the file', () => {
    assert.deepEqual(job('other.yml', 'boxed').setup[0], { fileSays: '22.12.0', ranges: [{ from: '22.12.0', range: '22.12.0' }], step: '0', uses: 'actions/setup-node', versionFile: 'package.json' });
    const [python, node] = job('other.yml', 'own').setup;
    assert.deepEqual(python, { fileSays: '>=3.10, <3.14', ranges: [{ from: '>=3.10, <3.14', range: '>=3.10.0 <3.14.0' }], step: '0', uses: 'actions/setup-python', versionFile: 'pyproject.toml' });
    assert.deepEqual(node, { ranges: [{ from: 'lts/iron', range: '>=20.0.0 <21.0.0-0' }], step: '1', uses: 'actions/setup-node', version: 'lts/iron', versionFile: '.nvmrc' });
  });

  it('records the directory each command starts in', () => {
    const commands = door('pages.yml').commands;
    assert.deepEqual(commands.map((command) => [command.step, command.dir]), [['Install', 'site'], ['Build', 'site']]);
    assert.ok(door('ci.yml').commands.every((command) => command.dir === ''));
  });

  it('records no runtime for a door that is no workflow', () => {
    for (const entry of artifact.doors.filter((item) => item.kind)) assert.equal(entry.jobs, undefined, entry.name);
  });
});

describe('the ranges a pin can resolve to offline', () => {
  it('reads setup-node versions as setup-node does', () => {
    assert.equal(nodeRange('20'), '>=20.0.0 <21.0.0-0');
    assert.equal(nodeRange('v20.11.1'), '20.11.1');
    assert.equal(nodeRange('20.x'), '>=20.0.0 <21.0.0-0');
    assert.equal(nodeRange('lts/jod'), '>=22.0.0 <23.0.0-0');
    for (const online of ['lts/*', 'latest', 'node', 'current', '*', 'lts/-1', 'lts/unknownname', '22-nightly']) assert.equal(nodeRange(online), null, online);
  });

  it('reads setup-python versions, leaving other interpreters unresolved', () => {
    assert.equal(pythonRange('3.12'), '>=3.12.0 <3.13.0-0');
    assert.equal(pythonRange('3.x'), '>=3.0.0 <4.0.0-0');
    for (const other of ['pypy3.10', '3.13t', 'graalpy-24.0']) assert.equal(pythonRange(other), null, other);
  });

  it('reads a PEP 440 specifier as a semver range', () => {
    assert.equal(pep440Range('>=3.10'), '>=3.10.0');
    assert.equal(pep440Range('~=3.11'), '>=3.11.0 <4.0.0');
    assert.equal(pep440Range('==3.11.*'), '>=3.11.0 <3.12.0-0');
    assert.equal(pep440Range('>=3.9, !=3.9.1, <3.13'), '>=3.9.0 <3.13.0');
    assert.equal(pep440Range('===3.11.4'), null);
  });

  it('knows the GitHub-hosted labels and no other', () => {
    assert.deepEqual(platformOf('ubuntu-22.04'), { os: 'linux', cpu: 'x64', libc: 'glibc' });
    assert.deepEqual(platformOf('ubuntu-24.04-arm'), { os: 'linux', cpu: 'arm64', libc: 'glibc' });
    assert.deepEqual(platformOf('macos-15-intel'), { os: 'darwin', cpu: 'x64' });
    assert.deepEqual(platformOf('macos-13'), { os: 'darwin', cpu: 'x64' });
    assert.deepEqual(platformOf('macos-latest'), { os: 'darwin', cpu: 'arm64' });
    assert.deepEqual(platformOf('windows-11-arm'), { os: 'win32', cpu: 'arm64' });
    assert.equal(platformOf('gpu-runner'), null);
  });
});
