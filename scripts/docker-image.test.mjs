/**
 * The Atlas container's shape, pinned without Docker: the Dockerfile, the
 * files its build context admits, the entrypoint, the compose and fleet
 * examples, and the release job that pushes the image.
 *
 * The image is a consumer of the published package, so the load-bearing
 * claims are that it installs @dogfood-lab/atlas from npm at an exact version
 * and never copies the package tree, that /data is its memory, and that the
 * job pushing it runs only after the npm publish, with pinned actions and the
 * one extra permission it needs.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { readFleetConfig } from '@dogfood-lab/atlas/fleet';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const dockerfile = read('docker/Dockerfile');
const version = JSON.parse(read('package.json')).version;
// Instructions with their continuation lines joined, comments dropped.
const instructions = dockerfile
  .replace(/\\\r?\n/g, ' ')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const ofKind = (kind) => instructions.filter((line) => line.split(/\s+/)[0] === kind);

describe('docker/Dockerfile', () => {
  it('builds from node:22-alpine pinned by digest', () => {
    const from = ofKind('FROM');
    assert.equal(from.length, 1, 'one stage');
    assert.match(from[0], /^FROM node:22-alpine@sha256:[0-9a-f]{64}$/);
  });

  it('installs the published package at the exact version, retrying while npm catches up', () => {
    assert.deepEqual(ofKind('ARG'), [`ARG ATLAS_VERSION=${version}`], 'the default is the root package.json version (scripts/sync-version.mjs keeps it)');
    const install = ofKind('RUN').find((line) => line.includes('npm install'));
    assert.ok(install, 'an npm install step');
    assert.match(install, /npm install --global [^;]*--ignore-scripts[^;]*"@dogfood-lab\/atlas@\$\{ATLAS_VERSION\}"/);
    assert.match(install, /for attempt in [^;]*; do/, 'the install is retried');
    assert.match(install, /sleep \d+/, 'with a wait between tries');
    assert.match(install, /\.version"\)" = "\$ATLAS_VERSION"/, 'and the installed version is the one asked for');
  });

  it('copies only the page and the entrypoint, never the package tree', () => {
    const copies = [...ofKind('COPY'), ...ofKind('ADD')];
    assert.deepEqual(copies, [
      'COPY site/public/atlas/index.html site/public/atlas/render.js site/public/atlas/hero.webp /srv/atlas/',
      'COPY docker/entrypoint.sh /usr/local/bin/atlas-entrypoint',
    ]);
    for (const line of copies) assert.doesNotMatch(line, /packages\//);
    const ignore = read('docker/Dockerfile.dockerignore').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
    assert.deepEqual(ignore, [
      '*',
      '!site/public/atlas/index.html',
      '!site/public/atlas/render.js',
      '!site/public/atlas/hero.webp',
      '!docker/entrypoint.sh',
    ], 'the build context admits exactly the copied files');
  });

  it('keeps its memory on /data, works in /repo, and runs as the node user', () => {
    assert.deepEqual(ofKind('VOLUME'), ['VOLUME /data']);
    assert.deepEqual(ofKind('WORKDIR'), ['WORKDIR /repo']);
    assert.deepEqual(ofKind('USER'), ['USER node']);
    assert.deepEqual(ofKind('EXPOSE'), ['EXPOSE 8080']);
    assert.match(ofKind('RUN').find((line) => line.includes('apk add')), /apk add --no-cache git .*safe\.directory '\*'/);
    assert.match(dockerfile, /org\.opencontainers\.image\.source="https:\/\/github\.com\/dogfood-lab\/testing-os"/);
  });

  it('has the two entrypoints: an Atlas verb runs the CLI, the default runs the service', () => {
    assert.deepEqual(ofKind('ENTRYPOINT'), ['ENTRYPOINT ["/usr/local/bin/atlas-entrypoint"]']);
    assert.deepEqual(ofKind('CMD'), ['CMD ["atlas-fleet"]']);
    const entry = read('docker/entrypoint.sh');
    assert.match(entry, /^#!\/bin\/sh\n/);
    assert.match(entry, /init\|map\|check\|explain\|diff\) exec atlas "\$@" ;;/);
    assert.match(entry, /atlas-fleet\) [^\n]*exec atlas-fleet "\$@" ;;/);
    assert.match(entry, /\*\) exec "\$@" ;;/);
    const pkg = JSON.parse(read('packages/atlas/package.json'));
    assert.equal(pkg.bin.atlas, './cli.js');
    assert.equal(pkg.bin['atlas-fleet'], './bin/atlas-fleet.js');
    for (const file of ['bin/atlas-fleet.js', 'adapter/fleet.js']) assert.ok(pkg.files.includes(file), `${file} ships in the package`);
  });

  it('passes the verb and its exit code through the entrypoint', (t) => {
    const sh = spawnSync('sh', ['-c', 'exit 0']);
    if (sh.error || sh.status !== 0) {
      t.skip('no POSIX sh on this machine');
      return;
    }
    // atlas and atlas-fleet stand in as executables ahead on PATH, so what is
    // proved is the entrypoint's dispatch as written, exec included, not the
    // CLI. Files rather than shell functions: dash, the sh of the CI image,
    // rejects a hyphen in a function name.
    const stubs = mkdtempSync(join(tmpdir(), 'atlas-entrypoint-'));
    t.after(() => rmSync(stubs, { recursive: true, force: true }));
    writeFileSync(join(stubs, 'atlas'), '#!/bin/sh\necho "atlas $*"\nexit 3\n', { mode: 0o755 });
    writeFileSync(join(stubs, 'atlas-fleet'), '#!/bin/sh\necho "fleet $*"\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${stubs}${delimiter}${process.env.PATH ?? ''}` };
    const runEntry = (...args) => spawnSync('sh', [join(root, 'docker/entrypoint.sh'), ...args], { encoding: 'utf8', env });
    const mapped = runEntry('map', '--divergence', 'd.json');
    assert.equal(mapped.stdout, 'atlas map --divergence d.json\n');
    assert.equal(mapped.status, 3, 'the CLI exit code passes through');
    assert.equal(runEntry().stdout, 'fleet \n', 'no command is the service');
    assert.equal(runEntry('atlas-fleet').stdout, 'fleet \n');
    assert.equal(runEntry('echo', 'hi').stdout, 'hi\n');
  });
});

describe('docker examples', () => {
  it('compose mounts the memory and the checkouts, and publishes on this machine only', () => {
    const compose = parse(read('docker/compose.example.yml'));
    const service = compose.services.atlas;
    assert.equal(service.image, 'ghcr.io/dogfood-lab/atlas:latest');
    assert.deepEqual(service.volumes, ['./atlas-data:/data', './repos:/repos:ro']);
    assert.deepEqual(service.ports, ['127.0.0.1:8080:8080']);
  });

  it('the fleet example is a valid fleet file', () => {
    const config = readFleetConfig(read('docker/fleet.example.yml'));
    assert.equal(config.schedule, '0 6 * * 1');
    assert.equal(config.port, 8080);
    assert.ok(config.repositories.some((entry) => entry.path), 'a mounted checkout');
    assert.ok(config.repositories.some((entry) => entry.url), 'a clone URL');
  });
});

describe('release.yml container job', () => {
  const workflow = parse(read('.github/workflows/release.yml'));
  const job = workflow.jobs.container;

  it('runs after the npm publish, with packages: write on this job only', () => {
    assert.ok(job, 'a container job');
    assert.equal(job.needs, 'publish');
    assert.equal(job['runs-on'], 'ubuntu-latest');
    assert.equal(typeof job['timeout-minutes'], 'number');
    assert.deepEqual(job.permissions, { contents: 'read', packages: 'write', 'id-token': 'write' });
    assert.equal(workflow.permissions.packages, undefined, 'the workflow default grants no packages scope');
    assert.equal(workflow.jobs.publish.permissions, undefined, 'the publish job keeps the workflow default');
  });

  it('waits up to five minutes for npm to serve the version before building', () => {
    const wait = job.steps.find((step) => typeof step.run === 'string' && step.run.includes('npm view'));
    assert.ok(wait, 'a wait step');
    assert.match(wait.run, /npm view "@dogfood-lab\/atlas@\$\{VERSION\}" version/);
    const loop = /seq 1 (\d+)[\s\S]*sleep (\d+)/.exec(wait.run);
    assert.ok(loop, 'a bounded poll');
    assert.equal(Number(loop[1]) * Number(loop[2]), 300, 'five minutes');
    const build = job.steps.findIndex((step) => String(step.uses).startsWith('docker/build-push-action@'));
    assert.ok(job.steps.indexOf(wait) < build, 'before the build');
  });

  it('pins every action to a commit and pushes both tags with provenance', () => {
    const uses = job.steps.filter((step) => step.uses).map((step) => step.uses);
    for (const ref of uses) assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, ref);
    const text = read('.github/workflows/release.yml');
    assert.match(text, /docker\/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4\.4\.1/);
    assert.match(text, /docker\/login-action@dbcb813823bdd20940b903addbd779551569679f # v4\.6\.0/);
    assert.match(text, /docker\/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7\.4\.0/);
    const login = job.steps.find((step) => String(step.uses).startsWith('docker/login-action@'));
    assert.deepEqual(login.with, { registry: 'ghcr.io', username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' });
    const build = job.steps.find((step) => String(step.uses).startsWith('docker/build-push-action@')).with;
    assert.equal(build.push, true);
    assert.equal(build.file, 'docker/Dockerfile');
    assert.equal(build.context, '.');
    assert.match(String(build.provenance), /^(true|mode=max)$/);
    assert.match(build['build-args'], /^ATLAS_VERSION=\$\{\{ steps\.version\.outputs\.version \}\}$/m);
    assert.deepEqual(build.tags.trim().split('\n'), [
      'ghcr.io/dogfood-lab/atlas:${{ steps.version.outputs.version }}',
      'ghcr.io/dogfood-lab/atlas:latest',
    ]);
  });

  it('names the compensator for the push', () => {
    const text = read('.github/workflows/release.yml');
    const at = text.indexOf('  container:');
    const note = text.slice(text.lastIndexOf('COMPENSATOR', at), at);
    assert.match(note, /packages\/container\/atlas\/versions/);
    assert.match(note, /Owner: release captain/);
  });
});
