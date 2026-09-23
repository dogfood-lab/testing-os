/**
 * The fleet service's logic, run against real fixture repositories with real
 * git and the real CLI. Only the network is stood in for: a url entry's
 * ls-remote and clone are pointed at a local repository, so what is proved is
 * the service's own handling of the clone, not a remote's.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
  ENGINE,
  HISTORY_CAP,
  createFleetServer,
  defaultRun,
  isFirstStart,
  nameFromUrl,
  nextRun,
  readFleetConfig,
  redact,
  runFleetOnce,
  servedShell,
  startFleetService,
} from './fleet.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(HERE, '../../../fixtures/atlas');
const ASSETS = resolve(HERE, '../../../site/public/atlas');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function scratch(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

function git(cwd, args, env = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function commit(cwd, message, env = {}) {
  git(cwd, ['add', '-A']);
  git(cwd, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', message], env);
}

// A fixture as a committed repository whose origin names it on GitHub, the
// way an operator's checkout would. Nothing ever fetches from that origin.
function checkoutOf(fixture, origin, env = {}) {
  const root = scratch('atlas-fleet-repo-');
  cpSync(join(FIXTURES, fixture), root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['config', 'core.autocrlf', 'false']);
  if (origin) git(root, ['remote', 'add', 'origin', origin]);
  commit(root, 'fixture', env);
  return root;
}

// Every file under the root, .git included, by content and mtime: a service
// that wrote anything into the checkout, or let git refresh its index there,
// would change a row.
function snapshot(root) {
  const rows = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      rows.push({
        path: relative(root, path).replaceAll('\\', '/'),
        hash: createHash('sha256').update(readFileSync(path)).digest('hex'),
        mtimeMs: statSync(path).mtimeMs,
      });
    }
  };
  walk(root);
  return rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function configFor(lines) {
  return readFleetConfig(['schedule: "0 6 * * 1"', 'repositories:', ...lines].join('\n'));
}

async function once(dataDir, config, extra = {}) {
  const logs = [];
  const result = await runFleetOnce({ dataDir, config, log: (line) => logs.push(line), ...extra });
  return { ...result, logs };
}

async function freePort() {
  const probe = createServer();
  await new Promise((done) => probe.listen(0, '127.0.0.1', done));
  const { port } = probe.address();
  await new Promise((done) => probe.close(done));
  return port;
}

describe('fleet service: a mounted checkout', () => {
  const name = 'acme/doors';
  const repo = checkoutOf('doors', `https://github.com/${name}.git`);
  const dataDir = scratch('atlas-fleet-data-');
  const config = configFor([`  - path: ${JSON.stringify(repo)}`]);
  const repoDir = join(dataDir, 'atlas', 'acme', 'doors');
  const untouched = snapshot(repo);

  it('maps on the first run and writes the render, state and fleet under /data', async () => {
    assert.equal(isFirstStart(dataDir), true);
    const { logs } = await once(dataDir, config);
    assert.deepEqual(logs, [`render ${name}`], 'one line for the one repository');
    for (const file of ['structure.json', 'statistics.json', 'page.json', 'README.md', 'divergence.json', 'history.json']) {
      assert.ok(existsSync(join(repoDir, file)), file);
    }
    const head = git(repo, ['rev-parse', 'HEAD']);
    const state = readJson(join(dataDir, 'atlas', 'state.json'));
    assert.equal(state.rendered[name].commit, head);
    assert.equal(state.rendered[name].engine, ENGINE, 'the state says which engine made the render');
    assert.deepEqual(state.failures, {});
    const fleet = readJson(join(dataDir, 'atlas', 'fleet.json'));
    assert.equal(fleet.repositories.length, 1);
    const row = fleet.repositories[0];
    assert.deepEqual(Object.keys(row).sort(), ['ageDays', 'boundaries', 'commit', 'confidence', 'doors', 'openDivergence', 'renderedAt', 'repo', 'unresolved']);
    assert.equal(row.repo, name);
    assert.equal(row.commit, head);
    assert.ok(row.doors > 0, 'the doors fixture has doors');
    assert.equal(readJson(join(repoDir, 'divergence.json')).repo, name, 'the map was told the name');
    assert.deepEqual(readJson(join(repoDir, 'history.json')).entries.map((entry) => entry.headlineKind), ['first']);
    assert.equal(isFirstStart(dataDir), false);
    assert.equal(existsSync(join(dataDir, 'work')), false, 'scratch is removed after the run');
    assert.deepEqual(snapshot(repo), untouched, 'the checkout, .git included, is as it was');
  });

  it('skips a second run when the checkout has not moved', async () => {
    const before = readFileSync(join(repoDir, 'history.json'), 'utf8');
    const { logs } = await once(dataDir, config);
    assert.deepEqual(logs, [`skip ${name} unchanged`]);
    assert.equal(readFileSync(join(repoDir, 'history.json'), 'utf8'), before);
  });

  it('renders an unmoved checkout again when another engine made the last render', async () => {
    const statePath = join(dataDir, 'atlas', 'state.json');
    const state = readJson(statePath);
    // A state written before the field existed reads the same as another engine.
    delete state.rendered[name].engine;
    writeFileSync(statePath, JSON.stringify(state));
    const { logs } = await once(dataDir, config);
    assert.deepEqual(logs, [`render ${name}`]);
    assert.equal(readJson(statePath).rendered[name].engine, ENGINE);
    assert.deepEqual((await once(dataDir, config)).logs, [`skip ${name} unchanged`], 'and the current engine skips it again');
  });

  it('maps a change and appends it to a history that keeps the newest 52', async () => {
    const full = Array.from({ length: HISTORY_CAP }, (_, index) => ({
      renderedAt: new Date(Date.UTC(2025, 8, 1) + index * 7 * 86_400_000).toISOString(),
      commit: String(index).padStart(40, '0'),
      itemCount: index,
      headlineKind: 'door',
      fileCounts: null,
    }));
    writeFileSync(join(repoDir, 'history.json'), `${JSON.stringify({ entries: full })}\n`);
    writeFileSync(join(repo, 'lib', 'audit.js'), "import { verify } from './verify.js';\nexport const audit = () => verify();\n");
    commit(repo, 'add audit');
    const committed = snapshot(repo);
    const { logs } = await once(dataDir, config);
    assert.deepEqual(logs, [`render ${name}`]);
    assert.deepEqual(snapshot(repo), committed, 'a second map writes nothing into the checkout either');
    assert.equal(existsSync(join(repo, 'atlas', 'structure.json')), false);
    const head = git(repo, ['rev-parse', 'HEAD']);
    const entries = readJson(join(repoDir, 'history.json')).entries;
    assert.equal(entries.length, HISTORY_CAP);
    assert.deepEqual(entries[0], full[1], 'the oldest entry is the one dropped');
    assert.equal(entries.at(-1).commit, head);
    assert.notEqual(entries.at(-1).headlineKind, 'first', 'a repository with no committed map is compared with the last render');
    assert.equal(readJson(join(repoDir, 'page.json')).changes.first, undefined);
    assert.equal(readJson(join(dataDir, 'atlas', 'state.json')).rendered[name].commit, head);
  });
});

describe('fleet service: repositories without a boundary file, or without recent commits', () => {
  it('maps from a proposal, marks the row proposed, and leaves no boundary file behind', async () => {
    const repo = checkoutOf('basic', 'git@github.com:acme/basic.git');
    const frozen = snapshot(repo);
    const dataDir = scratch('atlas-fleet-data-');
    const { logs, fleet, state } = await once(dataDir, configFor([`  - path: ${JSON.stringify(repo)}`]));
    assert.deepEqual(logs, ['render acme/basic proposed']);
    assert.equal(fleet.repositories[0].proposed, true);
    assert.equal(state.rendered['acme/basic'].proposed, true);
    assert.ok(readJson(join(dataDir, 'atlas', 'acme', 'basic', 'structure.json')).boundaries.length > 0);
    assert.deepEqual(snapshot(repo), frozen);
  });

  it('maps a checkout whose newest commit is older than the window at depth 1', async () => {
    const old = { GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' };
    const repo = checkoutOf('doors', null, old);
    const dataDir = scratch('atlas-fleet-data-');
    const { logs, state } = await once(dataDir, configFor([`  - path: ${JSON.stringify(repo)}`, '    name: acme/quiet']));
    assert.deepEqual(logs, ['render acme/quiet']);
    assert.deepEqual(state.failures, {});
  });

  it('records a checkout that is not a repository as a failure and keeps going', async () => {
    const empty = scratch('atlas-fleet-empty-');
    const repo = checkoutOf('doors', 'https://github.com/acme/doors.git');
    const dataDir = scratch('atlas-fleet-data-');
    const { logs, state } = await once(dataDir, configFor([
      `  - path: ${JSON.stringify(empty)}`,
      '    name: acme/empty',
      `  - path: ${JSON.stringify(repo)}`,
    ]));
    assert.match(logs[0], /^failure acme\/empty head/);
    assert.equal(logs[1], 'render acme/doors');
    assert.equal(state.failures['acme/empty'].commit, null);
  });
});

describe('fleet service: a url entry', () => {
  it('clones shallow into /data/clones once, then fetches', async () => {
    const source = checkoutOf('doors', null);
    const sourceUrl = pathToFileURL(source).href;
    const url = 'https://example.invalid/acme/widgets.git';
    const calls = [];
    // The only stand-in: the remote. Every other git call, and every map, is real.
    const run = (command, args, opts = {}) => {
      calls.push({ command, args: [...args], cwd: opts.cwd ?? null });
      return defaultRun(command, args.map((arg) => (arg === url ? sourceUrl : arg)), opts);
    };
    const dataDir = scratch('atlas-fleet-data-');
    const config = configFor([`  - url: ${url}`]);
    assert.equal(config.repositories[0].name, 'acme/widgets');
    const first = await once(dataDir, config, { run });
    assert.deepEqual(first.logs, ['render acme/widgets']);
    const clones = join(dataDir, 'clones', 'acme', 'widgets');
    const clone = calls.find((call) => call.args[0] === 'clone');
    assert.deepEqual(clone.args.slice(0, 2), ['clone', '--shallow-since']);
    assert.ok(clone.args.includes('--single-branch'));
    assert.equal(clone.args.at(-2), url);
    assert.equal(resolve(clone.args.at(-1)), resolve(clones));
    assert.ok(calls.some((call) => call.args[0] === 'ls-remote' && call.args.includes(url)));
    assert.equal(git(clones, ['rev-parse', 'HEAD']), git(source, ['rev-parse', 'HEAD']));

    writeFileSync(join(source, 'lib', 'audit.js'), 'export const audit = 1;\n');
    commit(source, 'add audit');
    calls.length = 0;
    const second = await once(dataDir, config, { run });
    assert.deepEqual(second.logs, ['render acme/widgets']);
    assert.equal(calls.some((call) => call.args[0] === 'clone'), false, 'the clone is kept');
    const fetched = calls.find((call) => call.args[0] === 'fetch');
    assert.deepEqual(fetched.args.slice(0, 2), ['fetch', '--shallow-since']);
    assert.equal(resolve(fetched.cwd), resolve(clones));
    assert.equal(git(clones, ['rev-parse', 'HEAD']), git(source, ['rev-parse', 'HEAD']));
    assert.equal(readJson(join(dataDir, 'atlas', 'acme', 'widgets', 'history.json')).entries.length, 2);
  });
});

describe('fleet server', () => {
  it('answers the fleet list, a page, the artifacts, and nothing else under /data', async (t) => {
    const repo = checkoutOf('doors', 'https://github.com/acme/doors.git');
    const dataDir = scratch('atlas-fleet-data-');
    writeFileSync(join(dataDir, 'fleet.yml'), `repositories:\n  - url: https://token-value@example.invalid/acme/secret.git\n`);
    await once(dataDir, configFor([`  - path: ${JSON.stringify(repo)}`]));
    const server = createFleetServer({ dataDir, assetsDir: ASSETS });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    t.after(() => new Promise((done) => server.close(done)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (path, init) => {
      const response = await fetch(base + path, init);
      return { status: response.status, type: response.headers.get('content-type'), body: await response.text() };
    };

    const list = await get('/');
    assert.equal(list.status, 200);
    assert.match(list.type, /^text\/html/);
    assert.match(list.body, /<head>\n<meta name="atlas-base" content="\/">/);
    const page = await get('/?repo=acme/doors');
    assert.equal(page.body, list.body, 'the page is the same shell, which reads ?repo= itself');
    assert.match((await get('/render.js')).type, /^text\/javascript/);
    assert.equal((await get('/hero.webp')).type, 'image/webp');

    const fleet = await get('/indexes/atlas/fleet.json');
    assert.equal(fleet.status, 200);
    assert.equal(JSON.parse(fleet.body).repositories[0].repo, 'acme/doors');
    assert.equal((await get('/atlas/fleet.json')).body, fleet.body);
    const data = await get('/indexes/atlas/acme/doors/page.json');
    assert.equal(data.status, 200);
    assert.match(data.type, /^application\/json/);
    const markdown = await get('/atlas/acme/doors/README.md');
    assert.equal(markdown.status, 200);
    assert.match(markdown.type, /^text\/markdown/);
    assert.equal((await get('/atlas/acme/doors/history.json')).status, 200);

    for (const path of ['/fleet.yml', '/atlas/../fleet.yml', '/atlas/%2e%2e/fleet.yml', '/clones/acme/doors/README.md', '/atlas/acme/doors/boundaries.yaml', '/atlas/acme/missing/page.json', '/index.html/../fleet.yml']) {
      const refused = await get(path);
      assert.equal(refused.status, 404, path);
      assert.doesNotMatch(refused.body, /token-value/, path);
    }
    assert.equal((await get('/', { method: 'POST' })).status, 405);
  });

  it('refuses a page shell it cannot name its base in', () => {
    assert.throws(() => servedShell('<html><body></body></html>'), /no <head>/);
  });
});

describe('fleet service start', () => {
  it('maps at once when /data holds no state, and waits for the schedule when it does', async () => {
    const repo = checkoutOf('doors', 'https://github.com/acme/doors.git');
    const dataDir = scratch('atlas-fleet-data-');
    const port = await freePort();
    writeFileSync(join(dataDir, 'fleet.yml'), `port: ${port}\nrepositories:\n  - path: ${JSON.stringify(repo)}\n`);
    const logs = [];
    const first = await startFleetService({ dataDir, assetsDir: ASSETS, log: (line) => logs.push(line) });
    await first.firstRun;
    await first.stop();
    assert.ok(logs.includes('no state in /data: mapping now'));
    assert.ok(logs.includes('render acme/doors'));
    assert.ok(logs.includes('run finished'));
    assert.ok(existsSync(join(dataDir, 'atlas', 'state.json')));

    const later = [];
    const second = await startFleetService({ dataDir, assetsDir: ASSETS, log: (line) => later.push(line) });
    await second.firstRun;
    const response = await fetch(`http://127.0.0.1:${port}/atlas/fleet.json`);
    assert.equal(response.status, 200, 'the state from the first start is served after a restart');
    await second.stop();
    assert.deepEqual(later, [`atlas-fleet serving on 0.0.0.0:${port}, 1 repositories, schedule 0 6 * * 1 UTC`]);
  });

  it('stops with a message when there is no fleet file', async () => {
    const dataDir = scratch('atlas-fleet-data-');
    await assert.rejects(startFleetService({ dataDir, assetsDir: ASSETS, log: () => {} }), /no fleet file at .*fleet\.yml/);
  });
});

describe('fleet file', () => {
  it('fills the schedule and port, and names a url by its last two segments', () => {
    const config = readFleetConfig('repositories:\n  - url: https://github.com/dogfood-lab/testing-os.git\n  - path: /repos/x\n');
    assert.equal(config.schedule, '0 6 * * 1');
    assert.equal(config.port, 8080);
    assert.deepEqual(config.repositories, [
      { url: 'https://github.com/dogfood-lab/testing-os.git', name: 'dogfood-lab/testing-os', branch: null },
      { path: '/repos/x', name: null },
    ]);
    assert.deepEqual(readFleetConfig('').repositories, []);
  });

  it('refuses a malformed entry with the field it is about', () => {
    const cases = [
      ['repositories:\n  - path: /a\n    url: https://x/a/b.git\n', /exactly one of path or url/],
      ['repositories:\n  - path: relative/dir\n', /path must be absolute/],
      ['port: 70000\n', /port must be/],
      ['schedule: "every monday"\n', /five cron fields/],
      ['schedule: "61 * * * *"\n', /minute 61 is out of range/],
      ['colour: blue\n', /unknown field colour/],
      ['repositories:\n  - path: /a\n    owner: me\n', /owner is not a repository field/],
      ['repositories:\n  - path: /a\n    branch: main\n', /only for a url/],
      ['repositories:\n  - url: https://x/a/b.git\n  - url: https://y/a/b.git\n', /a\/b is listed twice/],
      ['repositories:\n  - url: https://example.invalid\n', /give it a name/],
      ['repositories: [', /not valid YAML/],
    ];
    for (const [text, expected] of cases) assert.throws(() => readFleetConfig(text), expected, text);
  });

  it('reads the owner and repository from the forms a clone URL takes', () => {
    assert.equal(nameFromUrl('https://github.com/acme/widgets.git'), 'acme/widgets');
    assert.equal(nameFromUrl('https://gitlab.example.com/group/sub/widgets/'), 'sub/widgets');
    assert.equal(nameFromUrl('git@github.com:acme/widgets.git'), 'acme/widgets');
    assert.equal(nameFromUrl('ssh://git@host:2222/acme/widgets'), 'acme/widgets');
    assert.equal(nameFromUrl('widgets'), null);
  });

  it('never repeats a token carried in a clone URL', () => {
    assert.equal(
      redact("fatal: unable to access 'https://x-access-token:ghp_secret@github.com/acme/w.git/': 403"),
      "fatal: unable to access 'https://***@github.com/acme/w.git/': 403",
    );
  });
});

describe('schedule', () => {
  it('finds the next minute a cron expression names, in UTC', () => {
    const at = (iso) => new Date(iso);
    assert.equal(nextRun('0 6 * * 1', at('2026-09-22T06:00:00Z')).toISOString(), '2026-09-28T06:00:00.000Z');
    assert.equal(nextRun('0 6 * * 1', at('2026-09-28T05:59:30Z')).toISOString(), '2026-09-28T06:00:00.000Z');
    assert.equal(nextRun('0 6 * * 1', at('2026-09-28T06:00:00Z')).toISOString(), '2026-10-05T06:00:00.000Z', 'strictly after');
    assert.equal(nextRun('*/15 * * * *', at('2026-09-22T06:07:00Z')).toISOString(), '2026-09-22T06:15:00.000Z');
    assert.equal(nextRun('30 2 1 * *', at('2026-12-15T00:00:00Z')).toISOString(), '2027-01-01T02:30:00.000Z');
    assert.equal(nextRun('0 0 * * 7', at('2026-09-22T00:00:00Z')).toISOString(), '2026-09-27T00:00:00.000Z', '7 is Sunday');
    // With both day fields restricted, cron runs on either.
    assert.equal(nextRun('0 0 1 * 5', at('2026-09-22T00:00:00Z')).toISOString(), '2026-09-25T00:00:00.000Z');
    assert.throws(() => nextRun('0 0 31 2 *', at('2026-01-01T00:00:00Z')), /no time that can occur/);
  });
});

describe('atlas map --name and --baseline', () => {
  it('refuses a name that is not owner/repo, and a baseline that holds no map', () => {
    const repo = checkoutOf('doors', null);
    const bad = spawnSync(process.execPath, [CLI, 'map', '--name', 'not-a-name'], { cwd: repo, encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.equal(bad.stdout, 'atlas: --name needs owner/repo\nexit 2\n');
    const empty = scratch('atlas-baseline-');
    const missing = spawnSync(process.execPath, [CLI, 'map', '--baseline', empty], { cwd: repo, encoding: 'utf8' });
    assert.equal(missing.status, 2);
    assert.match(missing.stdout, /--baseline needs a directory holding a structure\.json/);
    const unnamed = spawnSync(process.execPath, [CLI, 'map', '--divergence', join(empty, 'd.json')], { cwd: repo, encoding: 'utf8' });
    assert.equal(unnamed.status, 2);
    assert.match(unnamed.stdout, /or --name/);
  });
});
