import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { commitAll, git, initializeParams, mapIn, startServer } from './test-client.js';

// docs/atlas-buildup.spec.md, slice AP: "Consumers in the workspace", a
// section of atlas_reach when the server answers for more than one
// repository. A producer publishes three packages; consumers declare them in
// each state the spec names: the producer's map matches, is ahead of or
// behind the version a consumer resolved, or that version has no local tag;
// the link is made by the repository field, by hand in the consumer's
// boundary file, or not at all (unverified, shown with its reason); a
// consumer names a producer Atlas has no map for (an orphan); a root has no
// map; and a file lies in a Python package whose consumers Atlas does not
// read. The ref attacks on the tag step are in tags.test.js.

const scratchRoots = [];
let ws;
let list;
let elsewhere;
let cache;
const open = new Set();

function scratch(prefix) {
  const path = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  scratchRoots.push(path);
  return path;
}

function write(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

function repository(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  for (const [key, value] of [['core.autocrlf', 'false'], ['maintenance.auto', 'false'], ['gc.auto', '0']]) git(dir, ['config', key, value]);
  return dir;
}

// A map as an engine made it before package facts existed (slice AO): none
// of the package keys and no marker. The committed map is rewritten that way.
function asPreAoMap(dir) {
  const path = join(dir, 'atlas', 'structure.json');
  const structure = JSON.parse(readFileSync(path, 'utf8'));
  for (const key of ['packageFacts', 'manifests', 'packageDependencies', 'packagesPublished']) delete structure[key];
  for (const part of structure.boundaries) for (const file of part.files) delete file.packages;
  writeFileSync(path, `${JSON.stringify(structure, null, 2)}\n`);
}

const RELEASE = [
  'name: Release',
  'on:',
  '  push:',
  "    tags: ['v*']",
  'jobs:',
  '  publish:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - name: Publish',
  '        run: npm publish --workspaces',
  '',
].join('\n');

// The producer: three published packages, one of them with no repository
// field and one naming another repository, a Python package, an origin, and
// a history with a tag in each form: @acme/lib is tagged 1.0.0 as name@version,
// 1.1.0 as v<version>, 1.2.0 (the commit the map is made from) as v<version>,
// and 1.3.0 after the map as name-v<version>.
function producer(dir) {
  repository(dir);
  git(dir, ['remote', 'add', 'origin', 'git@github.com:acme/prod-lib.git']);
  write(dir, 'package.json', { name: 'prod-root', private: true, workspaces: ['packages/*'] });
  write(dir, 'packages/lib/package.json', { name: '@acme/lib', version: '1.2.0', repository: 'git+https://github.com/acme/prod-lib.git', main: 'index.js' });
  write(dir, 'packages/lib/index.js', "export { helper } from './util.js';\n");
  write(dir, 'packages/lib/util.js', 'export const helper = 1;\n');
  write(dir, 'packages/other/package.json', { name: '@acme/other', version: '0.1.0', main: 'index.js' });
  write(dir, 'packages/other/index.js', 'export const other = 1;\n');
  write(dir, 'packages/alien/package.json', { name: '@acme/alien', version: '0.2.0', repository: 'https://github.com/elsewhere/alien', main: 'index.js' });
  write(dir, 'packages/alien/index.js', 'export const alien = 1;\n');
  write(dir, 'py/pyproject.toml', '[project]\nname = "acme-py"\nversion = "0.1.0"\n');
  write(dir, 'py/mod.py', 'VALUE = 1\n');
  write(dir, '.github/workflows/release.yml', RELEASE);
  write(dir, 'atlas/boundaries.yaml', 'boundaries:\n  - name: packages\n    globs:\n      - packages/**\n    role: code\n  - name: py\n    globs:\n      - py/**\n    role: code\n  - name: root\n    globs:\n      - "*"\n      - .github/**\n    role: config\n');
  commitAll(dir, 'one');
  git(dir, ['tag', '@acme/lib@1.0.0']);
  appendFileSync(join(dir, 'packages/lib/util.js'), '// two\n');
  // The map committed at the commit v1.1.0 is tagged at was made before package facts.
  mapIn(dir);
  asPreAoMap(dir);
  commitAll(dir, 'two');
  git(dir, ['tag', 'v1.1.0']);
  appendFileSync(join(dir, 'packages/lib/util.js'), '// three\n');
  commitAll(dir, 'three');
  git(dir, ['tag', 'v1.2.0']);
  mapIn(dir);
  commitAll(dir, 'map');
  appendFileSync(join(dir, 'packages/lib/util.js'), '// after the map\n');
  commitAll(dir, 'after the map');
  git(dir, ['tag', '@acme/lib-v1.3.0']);
  return dir;
}

// A consumer: a manifest declaring packages, a lock resolving them, one
// source file, a map, and optionally producers named by hand.
function consumer(dir, { dependencies = {}, locked = {}, producers = null }) {
  repository(dir);
  write(dir, 'package.json', { name: `consumer-${dir.slice(dir.lastIndexOf('/') + 1).replace(/\W/g, '-')}`, private: true, dependencies });
  const packages = { '': { dependencies } };
  for (const [name, version] of Object.entries(locked)) packages[`node_modules/${name}`] = { version, resolved: `https://registry.npmjs.org/${name}/-/x-${version}.tgz` };
  write(dir, 'package-lock.json', { name: 'x', lockfileVersion: 3, requires: true, packages });
  write(dir, 'src/index.js', 'export const x = 1;\n');
  const claims = producers ? `producers:\n${producers.map((entry) => `  - package: "${entry.package}"\n    repository: ${entry.repository}\n`).join('')}` : '';
  write(dir, 'atlas/boundaries.yaml', `boundaries:\n  - name: src\n    globs:\n      - src/**\n    role: code\n  - name: root\n    globs:\n      - "*"\n    role: config\n${claims}`);
  commitAll(dir, 'consumer');
  mapIn(dir);
  commitAll(dir, 'map');
  return dir;
}

function server(options) {
  const s = startServer({ ...options, env: { LOCALAPPDATA: cache, XDG_CACHE_HOME: cache, ...options.env } });
  open.add(s);
  return s;
}

async function started(options) {
  const s = server(options);
  await s.request('initialize', initializeParams('2025-11-25', {}));
  s.notify('notifications/initialized');
  return s;
}

async function reach(s, paths, repo = 'prod-lib') {
  const result = (await s.request('tools/call', { name: 'atlas_reach', arguments: { repo, paths, full: true } })).result;
  assert.notEqual(result.isError, true, result.content[0].text);
  return result;
}

const groups = (result, fact) => result.structuredContent.answer.facts.filter((entry) => entry.fact === fact);
const consumersBy = (result, basis) => groups(result, 'consumers').find((entry) => entry.linkBasis === basis)?.items ?? [];
const row = (item) => [item.consumer, item.package, item.range, item.resolvedVersion, item.skew.state];

before(() => {
  ws = scratch('atlas-consumers-');
  elsewhere = scratch('atlas-consumers-elsewhere-');
  cache = scratch('atlas-consumers-cache-');
  producer(join(ws, 'prod-lib'));
  const lib = (version) => ({ dependencies: { '@acme/lib': '^1.0.0' }, locked: { '@acme/lib': version } });
  consumer(join(ws, 'c-match'), { dependencies: { '@acme/lib': '^1.2.0', '@acme/other': '^0.1.0' }, locked: { '@acme/lib': '1.2.0', '@acme/other': '0.1.0' } });
  consumer(join(ws, 'c-ahead'), lib('1.1.0'));
  consumer(join(ws, 'c-behind'), lib('1.3.0'));
  consumer(join(ws, 'c-unknown'), lib('9.9.9'));
  consumer(join(ws, 'c-old'), lib('1.0.0'));
  consumer(join(ws, 'c odd name'), lib('1.2.0'));
  consumer(join(ws, 'c-manual'), {
    dependencies: { '@acme/alien': '^0.2.0' },
    locked: { '@acme/alien': '0.2.0' },
    producers: [{ package: '@acme/alien', repository: 'prod-lib' }],
  });
  consumer(join(ws, 'c-alien'), { dependencies: { '@acme/alien': '^0.2.0' }, locked: { '@acme/alien': '0.2.0' } });
  consumer(join(ws, 'c-orphan'), { producers: [{ package: '@acme/ghost', repository: 'nowhere-repo' }] });
  consumer(join(ws, 'c-none'), {});
  // A consumer whose map predates package facts: it does declare @acme/lib, and its map cannot say so.
  consumer(join(ws, 'c-premap'), lib('1.2.0'));
  asPreAoMap(join(ws, 'c-premap'));
  commitAll(join(ws, 'c-premap'), 'a map from before package facts');
  // A root with no map at all.
  const bare = repository(join(ws, 'c-bare'));
  write(bare, 'file.txt', 'no map here\n');
  commitAll(bare, 'bare');
  list = join(ws, 'repos.txt');
  writeFileSync(list, ['prod-lib', 'c-match', 'c-ahead', 'c-behind', 'c-unknown', 'c-old', 'c odd name', 'c-manual', 'c-alien', 'c-orphan', 'c-none', 'c-premap', 'c-bare'].join('\n') + '\n');
});

afterEach(async () => {
  for (const s of open) await s.close();
  open.clear();
});

after(() => {
  while (scratchRoots.length > 0) rmSync(scratchRoots.pop(), { recursive: true, force: true });
});

describe('the consumers of a package a file is in', () => {
  it('are the other repositories that declare it, by the repository field, each with its skew', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const result = await reach(s, ['packages/lib/util.js']);
    const items = consumersBy(result, 'repository');
    assert.deepEqual(items.map(row), [
      ['c odd name', '@acme/lib', '^1.0.0', '1.2.0', 'match'],
      ['c-ahead', '@acme/lib', '^1.0.0', '1.1.0', 'ahead'],
      ['c-behind', '@acme/lib', '^1.0.0', '1.3.0', 'behind'],
      ['c-match', '@acme/lib', '^1.2.0', '1.2.0', 'match'],
      ['c-old', '@acme/lib', '^1.0.0', '1.0.0', 'ahead'],
      ['c-unknown', '@acme/lib', '^1.0.0', '9.9.9', 'unknown'],
    ], 'a tag at the map\'s commit is a match; the map is ahead of an older release and behind a later one');
    const by = (name) => items.find((item) => item.consumer === name);
    assert.equal(by('c-ahead').skew.tag, 'v1.1.0');
    assert.deepEqual(by('c-ahead').skew.atPublishedCommit, { map: true, packageFacts: false }, 'the map at the tagged commit predates package facts and cannot say what that release held');
    assert.deepEqual(by('c-old').skew.atPublishedCommit, { map: false }, 'no map was committed at the other tagged commit');
    assert.match(result.content[0].text, /the producer's map at v1\.1\.0 was made before package facts, so it cannot say whether that release held packages\/lib\/util\.js/);
    assert.match(result.content[0].text, /no map was committed at the producer's @acme\/lib@1\.0\.0/);
    assert.equal(by('c-match').skew.atPublishedCommit, undefined, 'a match needs no second map');
    assert.equal(by('c-old').skew.tag, '@acme/lib@1.0.0', 'the name@version form finds a scoped name whole');
    assert.equal(by('c-behind').skew.tag, '@acme/lib-v1.3.0', 'the name-v<version> form');
    assert.deepEqual(by('c-unknown').skew.tried, ['v<version>', '<version>', '<name>@<version>', '<name>-v<version>'], 'the answer names the forms it tried');
    assert.equal(by('c-unknown').skew.reason, 'no local tag for 9.9.9');
    assert.equal(by('c-match').producerMap.commit.length, 40);
    assert.equal(by('c-match').consumerMap.commit.length, 40);
    assert.deepEqual(groups(result, 'consumers').map((entry) => entry.basis), ['declared'], 'one group, known as the consumer\'s manifest declares it');
    // Only the package that holds the file is searched for.
    assert.equal(groups(result, 'consumers').flatMap((entry) => entry.items).some((item) => item.package === '@acme/other'), false);
    await s.close();
  });

  it('say how many of the others declare the package, and never say a consumer will break', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const result = await reach(s, ['packages/lib/util.js']);
    const text = result.content[0].text;
    assert.match(text, /6 of 10 other repositories among the roots declare @acme\/lib/);
    assert.doesNotMatch(text, /will break|zero consumers|no consumers/i);
    // A name that could read as words is quoted wherever the text names it.
    assert.match(text, /"c odd name"/);
    assert.doesNotMatch(text, /(?<!")c odd name(?!")/);
    await s.close();
  });

  it('are unverified, with the reason, when the producer\'s manifest names no repository or another one', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const other = await reach(s, ['packages/other/index.js']);
    const unverifiedOther = consumersBy(other, 'unverified');
    assert.deepEqual(unverifiedOther.map((item) => [item.consumer, item.package, item.why]), [['c-match', '@acme/other', 'the producer\'s manifest names no repository']]);
    assert.equal(unverifiedOther[0].skew.state, 'unknown');
    assert.equal(consumersBy(other, 'repository').length, 0, 'never repository on a name alone');
    const alien = await reach(s, ['packages/alien/index.js']);
    assert.deepEqual(consumersBy(alien, 'unverified').map((item) => [item.consumer, item.why]), [['c-alien', 'the producer\'s manifest names a repository other than its clone\'s origin']]);
    await s.close();
  });

  it('are made by hand in the consumer\'s boundary file, and only there', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const alien = await reach(s, ['packages/alien/index.js']);
    assert.deepEqual(consumersBy(alien, 'manual').map((item) => [item.consumer, item.package]), [['c-manual', '@acme/alien']]);
    assert.equal(consumersBy(alien, 'manual')[0].why, undefined);
    await s.close();
  });

  it('list a producer a consumer names that Atlas has no map for, as an orphan', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const result = await reach(s, ['packages/lib/util.js']);
    const orphans = groups(result, 'orphanProducers')[0].items;
    assert.deepEqual(orphans.map((item) => [item.consumer, item.package, item.repository, item.why]), [['c-orphan', '@acme/ghost', 'nowhere-repo', 'the repository is not one Atlas answers for']]);
    await s.close();
  });

  it('say what could not be read, and that the search is unverified, when a root has no map', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const result = await reach(s, ['packages/lib/util.js']);
    const search = groups(result, 'consumerSearch')[0].items[0];
    assert.equal(search.status, 'unverified');
    assert.equal(search.complete, false);
    assert.deepEqual(search.notRead.map((entry) => [entry.name, entry.kind]), [['c-premap', 'old-map'], ['c-bare', 'no-map']]);
    const reasons = result.structuredContent.answer.cannotSee.filter((entry) => entry.what === 'consumer').map((entry) => entry.reason);
    assert.ok(reasons.some((reason) => /provenance attestations \(need the registry\)/.test(reason)), 'attested is named, and unreachable');
    assert.ok(reasons.some((reason) => /files and exports lists are not read/.test(reason)), 'containment by manifest directory is said');
    assert.ok(reasons.some((reason) => /tags may be stale/.test(reason)));
    assert.ok(reasons.some((reason) => /no map Atlas can answer from/.test(reason)));
    await s.close();
  });

  // The fleet is on an engine without package facts until a pin wave moves it:
  // a map from then declares nothing it can be read to declare, and that is not
  // "none declare it" (R&D's review of #179).
  it('are not read from a consumer map made before package facts, which is not counted as none', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const result = await reach(s, ['packages/lib/util.js']);
    assert.equal(consumersBy(result, 'repository').some((item) => item.consumer === 'c-premap'), false, 'it cannot be read to declare the package');
    const search = groups(result, 'consumerSearch')[0].items[0];
    assert.equal(search.searched.includes('c-premap'), false, 'it is not counted as searched');
    assert.equal(search.complete, false);
    assert.equal(search.status, 'unverified');
    const entry = result.structuredContent.answer.cannotSee.find((item) => item.what === 'consumer' && /made before package facts/.test(item.reason));
    assert.deepEqual(entry.named, ['c-premap']);
    assert.match(result.content[0].text, /c-premap was not read: its map was made before package facts \(engine [^)]+\), so what it declares is unknown, not none; remap it with this engine/);
    await s.close();
  });

  it('are never none when the only other root has a map from before package facts', async () => {
    const only = join(ws, 'repos-premap.txt');
    writeFileSync(only, 'prod-lib\nc-premap\n');
    const s = await started({ cwd: elsewhere, args: ['--repos', only] });
    const result = await reach(s, ['packages/lib/util.js']);
    assert.equal(groups(result, 'consumers').length, 0);
    assert.equal(groups(result, 'consumerSearch')[0].items[0].status, 'unverified');
    assert.doesNotMatch(result.content[0].text, /none of the/);
    await s.close();
  });

  it('say so, and name nothing, when the producer\'s own map is from before package facts', async () => {
    const old = join(ws, 'prod-old');
    producer(old);
    asPreAoMap(old);
    commitAll(old, 'a map from before package facts');
    const pair = join(ws, 'repos-old-producer.txt');
    writeFileSync(pair, 'prod-old\nc-match\n');
    const s = await started({ cwd: elsewhere, args: ['--repos', pair] });
    const result = await reach(s, ['packages/lib/util.js'], 'prod-old');
    assert.equal(groups(result, 'consumers').length, 0);
    const search = groups(result, 'consumerSearch')[0].items[0];
    assert.equal(search.status, 'unverified');
    assert.deepEqual(search.packages, []);
    assert.ok(result.structuredContent.answer.cannotSee.some((item) => item.what === 'consumer' && /was made before package facts, so which packages hold these files is unknown/.test(item.reason)));
    assert.match(result.content[0].text, /the map of prod-old was made before package facts \(engine [^)]+\), so which packages hold these files is unknown and the consumers are unverified, not none/);
    assert.doesNotMatch(result.content[0].text, /none of the|declare @acme/);
    await s.close();
  });

  it('are unverified, never none, for a file in a Python package Atlas does not read', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const result = await reach(s, ['py/mod.py']);
    assert.equal(groups(result, 'consumers').length, 0);
    const search = groups(result, 'consumerSearch')[0].items[0];
    assert.deepEqual(search.ecosystemsNotRead, ['PyPI']);
    assert.equal(search.status, 'unverified');
    const text = result.content[0].text;
    assert.match(text, /ecosystem Atlas does not extract \(PyPI\); its consumers are unverified, not none/);
    assert.doesNotMatch(text, /none of the/);
    await s.close();
  });

  it('say none of the others declare it only when every root was read', async () => {
    const small = join(ws, 'repos-small.txt');
    writeFileSync(small, 'prod-lib\nc-none\n');
    const s = await started({ cwd: elsewhere, args: ['--repos', small] });
    const result = await reach(s, ['packages/lib/util.js']);
    assert.equal(groups(result, 'consumers').length, 0);
    assert.equal(groups(result, 'consumerSearch')[0].items[0].status, 'searched');
    assert.match(result.content[0].text, /none of the 1 other repository among the roots declares @acme\/lib; consumers outside the roots stay unseen/);
    await s.close();
  });

  it('are not searched for when only one repository is answered for', async () => {
    const one = join(ws, 'repos-one.txt');
    writeFileSync(one, 'prod-lib\n');
    const s = await started({ cwd: elsewhere, args: ['--repos', one] });
    const result = await reach(s, ['packages/lib/util.js']);
    assert.equal(groups(result, 'consumerSearch').length, 0);
    assert.equal(groups(result, 'consumers').length, 0);
    await s.close();
  });
});
