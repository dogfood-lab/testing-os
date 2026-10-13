import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { commitAll, git, initializeParams, mapIn, modernMeta, startServer } from './test-client.js';

// docs/atlas-buildup.spec.md, slice AN: one server answers for several
// repositories, each tool taking repo; the roots are fixed when it starts,
// by a --repos file or by the working directory and the client's roots at
// initialisation, and anything else is refused. roots.test.js holds the
// path rules; these tests hold the server: every tool with repo, the
// listing, the refusals, and roots that never widen.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const scratchRoots = [];
let ws;
let alpha;
let beta;
let commits;
let list;
let elsewhere;
let cache;

function scratch(prefix = 'atlas-repos-') {
  const path = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  scratchRoots.push(path);
  return path;
}

// A fixture committed and mapped in a folder of the given name, so the
// repository's name is known.
function mappedAt(fixture, dir) {
  mkdirSync(dir, { recursive: true });
  cpSync(resolve(REPO_ROOT, 'fixtures/atlas', fixture), dir, { recursive: true });
  git(dir, ['init', '-q']);
  for (const [key, value] of [['core.autocrlf', 'false'], ['maintenance.auto', 'false'], ['gc.auto', '0']]) git(dir, ['config', key, value]);
  commitAll(dir, 'fixture');
  mapIn(dir);
  commitAll(dir, 'map');
  return dir;
}

function mapCommit(dir) {
  return JSON.parse(readFileSync(join(dir, 'atlas', 'structure.json'), 'utf8')).generatedFrom.commit;
}

// Every server a test starts, closed after it even when an assertion fails:
// a server left running keeps the test process alive.
const open = new Set();

afterEach(async () => {
  for (const s of open) await s.close();
  open.clear();
});

// A server whose refresh cache is this test's, so nothing is written where
// another run keeps its maps.
function server(options) {
  const s = startServer({ ...options, env: { LOCALAPPDATA: cache, XDG_CACHE_HOME: cache, ...options.env } });
  open.add(s);
  return s;
}

async function started(options) {
  const s = server(options);
  await s.request('initialize', initializeParams('2025-11-25', options.capabilities ?? {}));
  s.notify('notifications/initialized');
  return s;
}

async function call(s, name, args) {
  return (await s.request('tools/call', { name, arguments: args })).result;
}

before(() => {
  ws = scratch();
  alpha = mappedAt('explain-places', join(ws, 'alpha'));
  beta = mappedAt('sidecar-reach', join(ws, 'beta'));
  commits = { alpha: mapCommit(alpha), beta: mapCommit(beta) };
  // Relative to the file: one list that works wherever the workspace is.
  list = join(ws, 'repos.txt');
  writeFileSync(list, '# the roots\nalpha\nbeta\n');
  elsewhere = scratch('atlas-repos-elsewhere-');
  cache = scratch('atlas-repos-cache-');
});

after(() => {
  while (scratchRoots.length > 0) rmSync(scratchRoots.pop(), { recursive: true, force: true });
});

describe('atlas mcp --repos', () => {
  it('lists its roots, takes repo on every tool, and names the repository every answer is about', async () => {
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const tools = (await s.request('tools/list')).result.tools;
    assert.deepEqual(tools.filter((tool) => !('repo' in tool.inputSchema.properties)).map((tool) => tool.name), ['atlas_repos']);

    const listing = await call(s, 'atlas_repos', {});
    assert.notEqual(listing.isError, true, listing.content[0].text);
    const items = listing.structuredContent.answer.facts[0].items;
    assert.deepEqual(items.map((item) => [item.name, item.path, item.from, item.default, item.map.commit, item.headAhead]), [
      ['alpha', alpha, 'repos file', false, commits.alpha, 1],
      ['beta', beta, 'repos file', false, commits.beta, 1],
    ], 'HEAD holds the commit that committed the map');
    assert.match(listing.content[0].text, /Atlas answers for 2 repositories, fixed when it started from the --repos file; a call that names no repo is refused/);

    const asked = [
      ['atlas_explain', { repo: 'alpha', path: 'store' }, 'alpha'],
      ['atlas_explain', { repo: beta, path: 'lib/core.js' }, 'beta'],
      ['atlas_overview', { repo: 'beta' }, 'beta'],
      ['atlas_reach', { repo: 'beta', paths: ['lib/core.js'] }, 'beta'],
      ['atlas_test_gaps', { repo: 'alpha' }, 'alpha'],
      ['atlas_changes', { repo: 'alpha', since: 'HEAD' }, 'alpha'],
      ['atlas_check_change', { repo: 'beta' }, 'beta'],
      ['atlas_refresh', { repo: 'alpha' }, 'alpha'],
    ];
    for (const [name, args, repo] of asked) {
      const result = await call(s, name, args);
      assert.notEqual(result.isError, true, `${name}: ${result.content[0].text}`);
      const { atlas } = result.structuredContent;
      assert.equal(atlas.checkout.name, repo, name);
      assert.equal(atlas.checkout.rootFrom, 'repos file', name);
      assert.match(atlas.line, new RegExp(`^Atlas [^ ]+ · repository ${repo} · `), name);
      if (name !== 'atlas_refresh') assert.equal(atlas.map.commit, commits[repo], name);
    }
    await s.close();
  });

  it('refuses a call that names no repo when it started in none of them, a repository it was not given, and a name it does not hold', async () => {
    const other = mappedAt('sidecar-reach', join(scratch(), 'gamma'));
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    for (const [args, said] of [
      [{ path: 'store' }, /^the directory atlas mcp was started in is not in a repository the --repos file names/],
      [{ path: 'store', repo: other }, /is not one of the roots fixed when atlas mcp started$/],
      [{ path: 'store', repo: 'gamma' }, /^no root is named gamma$/],
      [{ path: 'store', repo: 'alpha/store' }, /is a relative path$/],
    ]) {
      const result = await call(s, 'atlas_explain', args);
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error.code, 'ATLAS_SIDECAR_REPO_NOT_ALLOWED');
      assert.match(result.structuredContent.error.whatChanged[0], said);
      assert.match(result.content[0].text, /the roots are alpha \(.*\), beta \(.*\)/);
    }
    await s.close();
  });

  it('keeps every path a tool is given inside the repository it names', async () => {
    // A path from one root into another is a path the chosen repository's
    // map and checkout do not hold: refused, and nothing outside is read.
    const s = await started({ cwd: elsewhere, args: ['--repos', list] });
    const explained = await call(s, 'atlas_explain', { repo: 'beta', path: '../alpha/store' });
    assert.equal(explained.structuredContent.error.code, 'ATLAS_EXPLAIN_UNKNOWN_PATH');
    const checked = await call(s, 'atlas_check_change', { repo: 'beta', files: ['../alpha/lib/ledger.js'] });
    assert.equal(checked.structuredContent.error.code, 'ATLAS_EXPLAIN_UNKNOWN_PATH');
    assert.match(checked.structuredContent.error.whatChanged[0], /^\.\.\/alpha\/lib\/ledger\.js names no file in the map or the checkout$/);
    const reached = await call(s, 'atlas_reach', { repo: 'beta', paths: ['../alpha/lib/ledger.js'] });
    assert.equal(reached.structuredContent.error.code, 'ATLAS_EXPLAIN_UNKNOWN_PATH');
    await s.close();
  });

  it('answers a request of the stateless revision for the repository it names', async () => {
    const s = server({ cwd: elsewhere, args: ['--repos', list] });
    const result = (await s.request('tools/call', { name: 'atlas_overview', arguments: { repo: 'alpha' }, _meta: modernMeta() })).result;
    assert.notEqual(result.isError, true, result.content[0].text);
    assert.equal(result.structuredContent.atlas.map.commit, commits.alpha);
    await s.close();
  });

  it('answers by default for the repository it started in when the list names it', async () => {
    const s = await started({ cwd: beta, args: ['--repos', list] });
    const result = await call(s, 'atlas_overview', {});
    assert.equal(result.structuredContent.atlas.map.commit, commits.beta);
    const listing = await call(s, 'atlas_repos', {});
    assert.deepEqual(listing.structuredContent.answer.facts[0].items.map((item) => item.default), [false, true]);
    await s.close();
  });

  it('logs the client\'s roots and never uses them, and never asks again when they change', async () => {
    const offered = mappedAt('sidecar-reach', join(scratch(), 'offered'));
    let asked = 0;
    const s = await started({
      cwd: elsewhere,
      args: ['--repos', list],
      capabilities: { roots: { listChanged: true } },
      onRequest: () => {
        asked += 1;
        return { roots: [{ uri: pathToFileURL(offered).href, name: 'offered' }] };
      },
    });
    const refused = await call(s, 'atlas_overview', { repo: offered });
    assert.equal(refused.structuredContent.error.code, 'ATLAS_SIDECAR_REPO_NOT_ALLOWED');
    s.notify('notifications/roots/list_changed');
    await s.request('ping');
    assert.equal(asked, 1);
    await s.close();
    const log = s.stderr.join('');
    assert.match(log, /the client offered 1 root, not used, since --repos names the roots: file:/);
    assert.match(log, /the roots are fixed at start, so the new list is not asked for or used/);
  });
});

describe('atlas mcp without --repos', () => {
  it('answers for the client\'s roots at initialisation and the working directory, and never for a root added after', async () => {
    const later = mappedAt('sidecar-reach', join(scratch(), 'later'));
    let roots = [{ uri: pathToFileURL(beta).href, name: 'beta' }];
    let asked = 0;
    const s = await started({
      cwd: alpha,
      capabilities: { roots: { listChanged: true } },
      onRequest: () => {
        asked += 1;
        return { roots };
      },
    });
    const listing = await call(s, 'atlas_repos', {});
    assert.deepEqual(listing.structuredContent.answer.facts[0].items.map((item) => [item.name, item.from, item.default]), [
      ['beta', 'client root', true],
      ['alpha', 'working directory', false],
    ]);
    assert.equal((await call(s, 'atlas_overview', {})).structuredContent.atlas.map.commit, commits.beta);
    assert.equal((await call(s, 'atlas_overview', { repo: 'alpha' })).structuredContent.atlas.map.commit, commits.alpha);
    roots = [{ uri: pathToFileURL(later).href, name: 'later' }];
    s.notify('notifications/roots/list_changed');
    await s.request('ping');
    const refused = await call(s, 'atlas_overview', { repo: later });
    assert.equal(refused.structuredContent.error.code, 'ATLAS_SIDECAR_REPO_NOT_ALLOWED');
    assert.equal(asked, 1, 'a changed list is not asked for');
    await s.close();
  });

  it('names no repository in the line when it has one root, as before', async () => {
    const s = await started({ cwd: alpha });
    const result = await call(s, 'atlas_overview', {});
    assert.equal(result.structuredContent.atlas.checkout.name, 'alpha');
    assert.doesNotMatch(result.structuredContent.atlas.line, / · repository /);
    await s.close();
  });
});

describe('atlas mcp --repos refused at start', () => {
  function mcp(args) {
    return spawnSync(process.execPath, [CLI, 'mcp', ...args], { cwd: elsewhere, encoding: 'utf8', input: '' });
  }

  it('refuses a file it cannot use before serving anything, with stdout empty', () => {
    const missing = mcp(['--repos', join(ws, 'absent.txt')]);
    assert.equal(missing.status, 2);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /^ATLAS_SIDECAR_REPOS_FILE {2}The --repos file does not name a list of repositories the sidecar can answer for\.\n {2}what changed: {3}.*absent\.txt cannot be read: ENOENT\n/);
    const bad = join(ws, 'bad.txt');
    writeFileSync(bad, `alpha\n${join(alpha, 'store')}\n`);
    const inside = mcp(['--repos', bad]);
    assert.equal(inside.status, 2);
    assert.match(inside.stderr, /line 2: .*store is inside the repository at .*alpha; list the repository's top directory/);
  });

  it('takes no other argument', () => {
    for (const [args, said] of [[['--port', '80'], /got --port/], [['--repos'], /got --repos with no file/], [['--repos', list, 'extra'], /got extra after it/]]) {
      const result = mcp(args);
      assert.equal(result.status, 2, args.join(' '));
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^atlas: mcp takes only --repos <file>, /);
      assert.match(result.stderr, said);
    }
  });
});
