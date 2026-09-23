import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { ENGINE } from '@dogfood-lab/atlas/fleet';
import { BACKOFF_MS, HISTORY_CAP, JOB_BUDGET_MS, appendHistory, changeCount, earlierWindow, historyEntry, pushAuthEnv, readExclusions, rejectForeignPaths, renderFleet, shallowSinceDate } from './atlas-render.mjs';

const TEMPLATE = resolve(fileURLToPath(new URL('.', import.meta.url)), '../packages/atlas/templates/atlas-refresh.yml');
const WORKFLOW = resolve(fileURLToPath(new URL('.', import.meta.url)), '../.github/workflows/atlas-render.yml');

function json(body, status = 200, headers = {}) {
  return {
    ok: status < 400,
    status,
    headers,
    json: async () => {
      if (status >= 400) throw new Error('error body is not parsed');
      return body;
    },
  };
}

function repoRoot() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-render-root-'));
  mkdirSync(join(root, 'indexes', 'atlas'), { recursive: true });
  mkdirSync(join(root, 'packages', 'atlas'), { recursive: true });
  writeFileSync(join(root, 'packages', 'atlas', 'cli.js'), '');
  writeFileSync(join(root, 'indexes', 'atlas', 'exclude.txt'), '# none\n');
  return root;
}

function harness(t, setup) {
  const root = repoRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (setup.exclude) writeFileSync(join(root, 'indexes', 'atlas', 'exclude.txt'), setup.exclude);
  const sleeps = [];
  const calls = [];
  const fetches = [];
  const issues = { created: [], commented: [], open: setup.openIssues ?? [] };
  let maps = 0;
  const fetchImpl = async (url) => {
    fetches.push(url);
    if (url.includes('/orgs/mcp-tool-shop-org/repos')) return json(setup.org ?? []);
    if (url.includes('/orgs/dogfood-lab/repos')) return json(setup.lab ?? []);
    if (url.includes('/indexes/atlas/state.json')) return setup.state ? json(setup.state) : json(null, 404);
    if (url.includes('/indexes/atlas/fleet.json')) return setup.fleet ? json(setup.fleet) : json(null, 404);
    if (url.includes('/commits/')) {
      const name = url.match(/repos\/([^/]+\/[^/]+)\/commits/)[1];
      return json({ sha: setup.heads?.[name] ?? 'a'.repeat(40) });
    }
    if (url.includes('api.github.com/repos/') && !url.includes('/commits/')) return json({ default_branch: 'main' });
    if (url.includes('/divergence.json')) return setup.previous ? json(setup.previous) : json(null, 404);
    if (url.includes('/history.json')) {
      if (setup.historyStatus) return json(null, setup.historyStatus);
      return setup.history ? json(setup.history) : json(null, 404);
    }
    return json(null, 404);
  };
  const run = async (command, args, opts = {}) => {
    calls.push([command, args, opts]);
    if (args[0] === 'ls-remote') {
      if (setup.headFails) return { status: 128, stdout: '', stderr: 'could not read Username' };
      if (setup.headEmpty) return { status: 0, stdout: '', stderr: '' };
      const url = args[2] || '';
      const name = url.match(/github\.com\/(.+?)(?:\.git)?$/)?.[1] ?? '';
      const sha = setup.heads?.[name] ?? 'a'.repeat(40);
      const branch = args[3] || 'main';
      return { status: 0, stdout: `${sha}\trefs/heads/${branch}\n`, stderr: '' };
    }
    if (args[0] === 'clone') {
      if (setup.cloneFails) return { status: 128, stdout: '', stderr: 'transport' };
      mkdirSync(join(args.at(-1), 'atlas'), { recursive: true });
      if (!setup.notMapped) {
        const windowLine = setup.boundaryWindow == null
          ? ''
          : `window: ${typeof setup.boundaryWindow === 'number' ? setup.boundaryWindow : JSON.stringify(setup.boundaryWindow)}\n`;
        writeFileSync(join(args.at(-1), 'atlas', 'boundaries.yaml'), `${windowLine}summary: x\nboundaries: []\n`);
      }
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args.includes('map')) {
      maps += 1;
      if (setup.mapThrows && maps === 1) throw new Error('grammar exploded');
      const divergence = args[args.indexOf('--divergence') + 1];
      writeFileSync(divergence, JSON.stringify(setup.envelope ?? {
        rows: [{ id: 'row-1', rule: 'leaks', state: 'open', boundary: 'core' }],
      }));
      const atlas = join(opts.cwd, 'atlas');
      mkdirSync(atlas, { recursive: true });
      writeFileSync(join(atlas, 'structure.json'), JSON.stringify({
        boundaries: [{ name: 'core', unresolvedSites: 2 }],
        doors: [{ file: '.github/workflows/ci.yml', name: 'CI' }, { file: '.github/workflows/release.yml', name: 'Release' }],
        unassigned: [],
      }));
      writeFileSync(join(atlas, 'statistics.json'), JSON.stringify({
        confidence: { level: 'low' },
        generatedAt: '2026-09-22T06:00:00.000Z',
      }));
      writeFileSync(join(atlas, 'README.md'), 'README.md\n');
      writeFileSync(join(atlas, 'page.json'), `${JSON.stringify(setup.page ?? { changes: { first: true } })}\n`);
      return { status: 0, stdout: '', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return {
    root,
    sleeps,
    calls,
    fetches,
    issues,
    runFleet: (extra = {}) => renderFleet({
      fetch: fetchImpl,
      run,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => new Date('2026-09-22T06:00:00.000Z'),
      repoRoot: root,
      dryRun: extra.dryRun ?? true,
      log: () => {},
      issues: {
        listOpen: async () => issues.open,
        create: async (title, body) => { issues.created.push({ title, body }); },
        comment: async (number, body) => { issues.commented.push({ number, body }); },
      },
      ...extra,
    }),
  };
}

const PUBLIC = { full_name: 'dogfood-lab/testing-os', visibility: 'public', archived: false, default_branch: 'main' };
const OTHER = { full_name: 'mcp-tool-shop-org/widgets', visibility: 'public', archived: false, default_branch: 'main' };
const PRIVATE = { full_name: 'dogfood-lab/secret-vault', visibility: 'private', archived: false, default_branch: 'main' };
const ARCHIVED = { full_name: 'mcp-tool-shop-org/old', visibility: 'public', archived: true, default_branch: 'main' };

describe('atlas weekly render', () => {
  it('drops non-public and archived repositories before any log line', async (t) => {
    const { runFleet } = harness(t, {
      lab: [PUBLIC, PRIVATE],
      org: [ARCHIVED],
      state: {
        rendered: { 'dogfood-lab/secret-vault': { commit: 'c'.repeat(40), renderedAt: '2026-09-01T00:00:00.000Z' } },
        failures: { 'dogfood-lab/secret-vault': { commit: 'c'.repeat(40), at: '2026-09-01T00:00:00.000Z', reason: 'clone' } },
      },
    });
    const result = await runFleet();
    const text = result.logs.join('\n');
    assert.equal(result.logs[0], 'listed 1 public repositories');
    assert.equal(text.includes('secret-vault'), false);
    assert.equal(text.includes('mcp-tool-shop-org/old'), false);
    assert.equal(result.state.rendered['dogfood-lab/secret-vault'], undefined);
    assert.equal(result.state.failures['dogfood-lab/secret-vault'], undefined);
    assert.equal(result.publicCount, 1);
  });

  it('removes a repository named in the exclude file', async (t) => {
    const { runFleet, calls } = harness(t, {
      lab: [PUBLIC],
      exclude: '# keep\ndogfood-lab/testing-os\n',
    });
    const result = await runFleet();
    assert.equal(calls.some((call) => call[1][0] === 'clone'), false);
    assert.equal(result.fleet.repositories.length, 0);
  });

  it('skips a repository whose head is already rendered', async (t) => {
    const sha = 'b'.repeat(40);
    const { runFleet, calls } = harness(t, {
      lab: [PUBLIC],
      heads: { 'dogfood-lab/testing-os': sha },
      state: { rendered: { 'dogfood-lab/testing-os': { commit: sha, engine: ENGINE, renderedAt: '2026-09-01T00:00:00.000Z' } }, failures: {} },
      fleet: { repositories: [{ repo: 'dogfood-lab/testing-os', commit: sha, renderedAt: '2026-09-01T00:00:00.000Z', doors: 1 }] },
    });
    const result = await runFleet();
    assert.equal(calls.some((call) => call[1][0] === 'clone'), false);
    assert.match(result.logs.join('\n'), /skip dogfood-lab\/testing-os unchanged/);
  });

  it('retries a clone with the backoff schedule, records clone, and continues', async (t) => {
    const { runFleet, sleeps } = harness(t, { lab: [PUBLIC], org: [OTHER], cloneFails: true });
    const result = await runFleet();
    assert.deepEqual(sleeps, [...BACKOFF_MS, ...BACKOFF_MS]);
    assert.equal(result.state.failures['dogfood-lab/testing-os'].reason, 'clone transport');
    assert.equal(result.state.failures['mcp-tool-shop-org/widgets'].reason, 'clone transport');
    assert.equal(result.logs.filter((line) => line.startsWith('failure')).length, 2);
  });

  it('records a thrown map and continues to the next repository', async (t) => {
    const { runFleet } = harness(t, { lab: [PUBLIC], org: [OTHER], mapThrows: true });
    const result = await runFleet();
    assert.equal(result.state.failures['dogfood-lab/testing-os'].reason, 'grammar exploded');
    assert.equal(result.state.failures['mcp-tool-shop-org/widgets'], undefined);
    assert.ok(result.fleet.repositories.some((entry) => entry.repo === 'mcp-tool-shop-org/widgets'));
  });

  it('records not-mapped as state rather than a failure', async (t) => {
    const { runFleet } = harness(t, { lab: [PUBLIC], notMapped: true });
    const result = await runFleet();
    assert.equal(result.state.rendered['dogfood-lab/testing-os'].notMapped, true);
    assert.equal(result.state.failures['dogfood-lab/testing-os'], undefined);
  });

  it('opens an issue only when the divergence set changes, and comments when one is already open', async (t) => {
    const first = harness(t, {
      lab: [PUBLIC],
      previous: { rows: [{ id: 'old', rule: 'leaks', state: 'open', boundary: 'old' }] },
    });
    const opened = await first.runFleet({ dryRun: false });
    assert.equal(opened.changed, true);
    assert.equal(first.issues.created.length, 1);
    assert.match(first.issues.created[0].title, /^atlas: divergence changed /);
    assert.match(first.issues.created[0].body, /compare\/main\.\.\.atlas-render/);
    const second = harness(t, {
      lab: [PUBLIC],
      previous: { rows: [{ id: 'old', rule: 'leaks', state: 'open', boundary: 'old' }] },
      openIssues: [{ number: 9, title: 'atlas: divergence changed 2026-09-01' }],
    });
    await second.runFleet({ dryRun: false });
    assert.equal(second.issues.created.length, 0);
    assert.equal(second.issues.commented[0].number, 9);
    const same = harness(t, {
      lab: [PUBLIC],
      previous: { rows: [{ id: 'row-1', rule: 'leaks', state: 'open', boundary: 'core' }] },
    });
    const quiet = await same.runFleet({ dryRun: false });
    assert.equal(quiet.changed, false);
    assert.equal(same.issues.created.length, 0);
  });

  it('refuses a branch path that names a repository outside the listing', () => {
    assert.throws(
      () => rejectForeignPaths(['indexes/atlas/secret/hidden/divergence.json'], new Set(['dogfood-lab/testing-os'])),
      /outside the public listing/,
    );
    assert.doesNotThrow(() => rejectForeignPaths(
      ['indexes/atlas/state.json', 'indexes/atlas/fleet.json', 'indexes/atlas/dogfood-lab/testing-os/README.md'],
      new Set(['dogfood-lab/testing-os']),
    ));
  });

  it('resolves the head with unauthenticated ls-remote and records git stderr', async (t) => {
    const sha = 'd'.repeat(40);
    const ok = harness(t, { lab: [PUBLIC], heads: { 'dogfood-lab/testing-os': sha } });
    const rendered = await ok.runFleet();
    const lookup = ok.calls.find((call) => call[1][0] === 'ls-remote');
    assert.deepEqual(lookup[1], ['ls-remote', '--heads', 'https://github.com/dogfood-lab/testing-os.git', 'main']);
    assert.equal(lookup[2].env.GIT_CONFIG_COUNT, '1');
    assert.equal(lookup[2].env.GIT_CONFIG_KEY_0, 'credential.helper');
    assert.equal(lookup[2].env.GIT_CONFIG_VALUE_0, '');
    assert.equal(rendered.state.rendered['dogfood-lab/testing-os'].commit, sha);
    assert.equal(ok.fetches.some((url) => url.includes('/commits/')), false);
    const failed = harness(t, { lab: [PUBLIC], headFails: true });
    const result = await failed.runFleet();
    assert.equal(failed.calls.some((call) => call[1][0] === 'clone'), false);
    assert.equal(result.state.failures['dogfood-lab/testing-os'].reason, 'head could not read Username');
    assert.match(result.logs.join('\n'), /failure dogfood-lab\/testing-os head could not read Username/);
    const empty = harness(t, { lab: [PUBLIC], headEmpty: true });
    const blank = await empty.runFleet();
    assert.equal(blank.state.failures['dogfood-lab/testing-os'].reason, 'head');
  });

  it('clones with the default window and deepens when the boundary file pins an earlier start', async (t) => {
    const now = new Date('2026-09-22T06:00:00.000Z');
    const { runFleet, calls } = harness(t, { lab: [PUBLIC], boundaryWindow: '2020-01-15' });
    await runFleet();
    const clone = calls.find((call) => call[1][0] === 'clone');
    assert.equal(clone[1][1], '--shallow-since');
    assert.equal(clone[1][2], shallowSinceDate(now));
    assert.equal(clone[1].includes('--filter=blob:none'), false);
    const fetched = calls.find((call) => call[1][0] === 'fetch');
    assert.deepEqual(fetched[1].slice(0, 3), ['fetch', '--shallow-since', '2020-01-14']);
    const quiet = harness(t, { lab: [PUBLIC] });
    await quiet.runFleet();
    assert.equal(quiet.calls.some((call) => call[1][0] === 'fetch'), false);
  });

  it('stops starting repositories once the job budget is spent', async (t) => {
    const start = new Date('2026-09-22T06:00:00.000Z');
    let ticks = 0;
    const { runFleet, calls } = harness(t, { lab: [PUBLIC], org: [OTHER] });
    const result = await runFleet({
      clock: () => {
        ticks += 1;
        return ticks <= 2 ? start : new Date(start.getTime() + JOB_BUDGET_MS);
      },
    });
    assert.equal(calls.filter((call) => call[1][0] === 'clone').length, 1);
    assert.match(calls.find((call) => call[1][0] === 'clone')[1].at(-2), /dogfood-lab\/testing-os\.git$/);
    assert.match(result.logs.join('\n'), /job budget reached, 1 repository remains/);
    assert.equal(result.state.rendered['mcp-tool-shop-org/widgets'], undefined);
    assert.equal(result.state.failures['mcp-tool-shop-org/widgets'], undefined);
    assert.equal(result.fleet.repositories[0].repo, 'dogfood-lab/testing-os');
  });

  it('keeps an unchanged repository on the fleet and refreshes its age', async (t) => {
    const sha = 'c'.repeat(40);
    const { runFleet, calls } = harness(t, {
      lab: [PUBLIC],
      heads: { 'dogfood-lab/testing-os': sha },
      // The render on record is this engine's; one another engine made is rendered again.
      state: { rendered: { 'dogfood-lab/testing-os': { commit: sha, engine: ENGINE, renderedAt: '2026-09-01T00:00:00.000Z' } }, failures: {} },
      fleet: {
        repositories: [{
          repo: 'dogfood-lab/testing-os',
          commit: sha,
          renderedAt: '2026-09-01T00:00:00.000Z',
          ageDays: 0,
          boundaries: 4,
          doors: 3,
          unresolved: 1,
          openDivergence: 2,
          confidence: 'high',
        }],
      },
    });
    const result = await runFleet();
    assert.equal(calls.some((call) => call[1][0] === 'clone'), false);
    assert.equal(result.fleet.repositories.length, 1);
    assert.equal(result.fleet.repositories[0].ageDays, 21);
    assert.equal(result.fleet.repositories[0].boundaries, 4);
  });

  it('renders an unchanged repository again when another engine made the last render', async (t) => {
    const sha = 'c'.repeat(40);
    const { runFleet, calls } = harness(t, {
      lab: [PUBLIC],
      heads: { 'dogfood-lab/testing-os': sha },
      state: { rendered: { 'dogfood-lab/testing-os': { commit: sha, engine: ENGINE, renderedAt: '2026-09-01T00:00:00.000Z' } }, failures: {} },
      fleet: { repositories: [{ repo: 'dogfood-lab/testing-os', commit: sha, renderedAt: '2026-09-01T00:00:00.000Z', doors: 1 }] },
    });
    // The job stamps the tree's commit beside the version, so a new main is a new engine.
    const stamp = `${ENGINE}+abc123abc123`;
    const result = await runFleet({ engine: stamp });
    assert.equal(calls.some((call) => call[1][0] === 'clone'), true, 'the repository is cloned and mapped again');
    assert.equal(result.state.rendered['dogfood-lab/testing-os'].engine, stamp);
  });

  it('writes the fleet file shape', async (t) => {
    const { runFleet } = harness(t, { lab: [PUBLIC] });
    const result = await runFleet();
    const entry = result.fleet.repositories[0];
    assert.equal(entry.repo, 'dogfood-lab/testing-os');
    assert.equal(entry.boundaries, 1);
    assert.equal(entry.doors, 2);
    assert.equal('unnamed' in entry, false);
    assert.equal(entry.unresolved, 2);
    assert.equal(entry.openDivergence, 1);
    assert.equal(entry.confidence, 'low');
    assert.equal(typeof entry.ageDays, 'number');
    assert.equal(typeof entry.renderedAt, 'string');
    assert.equal(entry.commit, 'a'.repeat(40));
  });

  it('renders an unchanged repository again when its last render predates the page', async (t) => {
    const sha = 'c'.repeat(40);
    const { runFleet, calls } = harness(t, {
      lab: [PUBLIC],
      heads: { 'dogfood-lab/testing-os': sha },
      state: { rendered: { 'dogfood-lab/testing-os': { commit: sha, renderedAt: '2026-09-01T00:00:00.000Z' } }, failures: {} },
      fleet: {
        repositories: [{
          repo: 'dogfood-lab/testing-os',
          commit: sha,
          renderedAt: '2026-09-01T00:00:00.000Z',
          ageDays: 0,
          boundaries: 4,
          unnamed: 0,
          unresolved: 1,
          openDivergence: 2,
          confidence: 'high',
        }],
      },
    });
    const result = await runFleet();
    assert.equal(calls.some((call) => call[1][0] === 'clone'), true);
    assert.equal(result.fleet.repositories[0].doors, 2);
    assert.equal('unnamed' in result.fleet.repositories[0], false);
  });

  it('publishes the page and its data beside the map, and none of the retired renders', async (t) => {
    const { runFleet } = harness(t, { lab: [PUBLIC] });
    const result = await runFleet();
    const base = 'indexes/atlas/dogfood-lab/testing-os/';
    const published = result.paths.filter((path) => path.startsWith(base)).map((path) => path.slice(base.length)).sort();
    assert.deepEqual(published, ['README.md', 'divergence.json', 'history.json', 'page.json', 'statistics.json', 'structure.json']);
  });

  it('starts the history on a first render, with one entry read from page.json', async (t) => {
    const outRoot = mkdtempSync(join(tmpdir(), 'atlas-history-'));
    t.after(() => rmSync(outRoot, { recursive: true, force: true }));
    const { runFleet, fetches } = harness(t, { lab: [PUBLIC] });
    await runFleet({ outRoot });
    assert.ok(fetches.includes('https://raw.githubusercontent.com/dogfood-lab/testing-os/atlas-render/indexes/atlas/dogfood-lab/testing-os/history.json'));
    const written = JSON.parse(readFileSync(join(outRoot, 'dogfood-lab', 'testing-os', 'history.json'), 'utf8'));
    assert.deepEqual(written, {
      entries: [{ renderedAt: '2026-09-22T06:00:00.000Z', commit: 'a'.repeat(40), itemCount: 0, headlineKind: 'first', fileCounts: null }],
    });
  });

  it('appends one entry per render to the history on the branch, counting what "And n more" cut', async (t) => {
    const outRoot = mkdtempSync(join(tmpdir(), 'atlas-history-'));
    t.after(() => rmSync(outRoot, { recursive: true, force: true }));
    const earlier = { renderedAt: '2026-09-15T06:00:00.000Z', commit: 'b'.repeat(40), itemCount: 0, headlineKind: 'unchanged', fileCounts: null };
    const fileCounts = { added: 2, changed: 1, moved: 0, parts: 1, removed: 0 };
    const { runFleet } = harness(t, {
      lab: [PUBLIC],
      history: { entries: [earlier] },
      page: {
        changes: {
          fileCounts,
          items: [
            { kind: 'cycle', sentence: 'ingest now imports dogfood-swarm, which closes the cycle.', subjects: [] },
            { kind: 'door', sentence: 'CI now also runs a.js.', subjects: [] },
            { kind: 'door', sentence: 'And 3 more changes to a door.', subjects: [] },
            { kind: 'counts', sentence: '2 files added and 1 changed content, across 1 part.', subjects: [] },
          ],
          since: { commit: 'b'.repeat(40), generatedAt: '2026-09-15T06:00:00.000Z' },
          unchanged: false,
        },
      },
    });
    await runFleet({ outRoot });
    const written = JSON.parse(readFileSync(join(outRoot, 'dogfood-lab', 'testing-os', 'history.json'), 'utf8'));
    assert.deepEqual(written.entries, [
      earlier,
      { renderedAt: '2026-09-22T06:00:00.000Z', commit: 'a'.repeat(40), itemCount: 5, headlineKind: 'cycle', fileCounts },
    ]);
  });

  it('keeps at most 52 entries, dropping the oldest', async (t) => {
    const outRoot = mkdtempSync(join(tmpdir(), 'atlas-history-'));
    t.after(() => rmSync(outRoot, { recursive: true, force: true }));
    assert.equal(HISTORY_CAP, 52);
    const full = Array.from({ length: HISTORY_CAP }, (_, index) => ({
      renderedAt: new Date(Date.UTC(2025, 8, 1) + index * 7 * 86_400_000).toISOString(),
      commit: String(index).padStart(40, '0'),
      itemCount: index,
      headlineKind: 'door',
      fileCounts: null,
    }));
    const unchanged = { changes: { fileCounts: { added: 0, changed: 1, moved: 0, parts: 1, removed: 0 }, items: [{ kind: 'counts', sentence: 'Nothing structural changed since 2026-09-15; 1 file changed content.', subjects: [] }], unchanged: true } };
    const { runFleet } = harness(t, { lab: [PUBLIC], history: { entries: full }, page: unchanged });
    await runFleet({ outRoot });
    const written = JSON.parse(readFileSync(join(outRoot, 'dogfood-lab', 'testing-os', 'history.json'), 'utf8'));
    assert.equal(written.entries.length, HISTORY_CAP);
    assert.deepEqual(written.entries[0], full[1], 'the oldest entry is the one dropped');
    assert.deepEqual(written.entries.at(-1), {
      renderedAt: '2026-09-22T06:00:00.000Z',
      commit: 'a'.repeat(40),
      itemCount: 0,
      headlineKind: 'unchanged',
      fileCounts: unchanged.changes.fileCounts,
    });
  });

  it('writes no history when the one on the branch cannot be read, so a year is not restarted from one', async (t) => {
    const outRoot = mkdtempSync(join(tmpdir(), 'atlas-history-'));
    t.after(() => rmSync(outRoot, { recursive: true, force: true }));
    const { runFleet } = harness(t, { lab: [PUBLIC], historyStatus: 500 });
    const result = await runFleet({ outRoot });
    assert.equal(existsSync(join(outRoot, 'dogfood-lab', 'testing-os', 'history.json')), false);
    assert.equal(result.paths.includes('indexes/atlas/dogfood-lab/testing-os/history.json'), false);
    assert.equal(result.paths.includes('indexes/atlas/dogfood-lab/testing-os/page.json'), true, 'the render itself still lands');
    assert.match(result.logs.join('\n'), /history dogfood-lab\/testing-os kept: the previous history could not be read/);
  });

  it('counts structural changes the way the page states them', () => {
    assert.equal(changeCount(null), 0);
    assert.equal(changeCount({ first: true }), 0);
    assert.equal(changeCount({ unchanged: true, items: [{ kind: 'counts', sentence: 'Nothing structural changed.' }] }), 0);
    assert.equal(changeCount({ unchanged: false, items: [
      { kind: 'import-added', sentence: 'a now imports b.' },
      { kind: 'landing', sentence: 'And 12 more new writers or readers of places.' },
      { kind: 'counts', sentence: '1 file changed content.' },
    ] }), 13);
    assert.deepEqual(appendHistory({ entries: [1, null, { a: 1 }] }, { b: 2 }), { entries: [{ a: 1 }, { b: 2 }] }, 'junk rows on the branch are dropped');
    assert.equal(historyEntry({}, 'c', 'd').headlineKind, 'unchanged');
  });

  it('parses the private template as workflow YAML with only schedule and workflow_dispatch', () => {
    const text = readFileSync(TEMPLATE, 'utf8');
    const doc = parse(text);
    assert.deepEqual(Object.keys(doc.on).sort(), ['schedule', 'workflow_dispatch']);
    assert.match(text, /prepares a commit a person then merges/);
    assert.match(text, /actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0/);
    assert.doesNotMatch(text, /uses:.*@v\d/);
    const workflow = parse(readFileSync(WORKFLOW, 'utf8'));
    assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
    assert.equal(workflow.on.schedule[0].cron, '0 6 * * 1');
    assert.equal(workflow.jobs.render['runs-on'], 'ubuntu-latest');
    assert.equal(workflow.jobs.render['timeout-minutes'], 60);
    assert.deepEqual(workflow.permissions, { contents: 'write', issues: 'write' });
    assert.equal(workflow.concurrency.group, 'atlas-render');
    assert.equal(workflow.concurrency['cancel-in-progress'], false);
    assert.match(readFileSync(WORKFLOW, 'utf8'), /actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0/);
    assert.doesNotMatch(readFileSync(WORKFLOW, 'utf8'), /uses:.*@v\d/);
  });
});

describe('exclude file', () => {
  it('ignores comments and blank lines', () => {
    assert.deepEqual([...readExclusions('# note\n\nowner/repo\n')], ['owner/repo']);
  });
});

describe('push authentication', () => {
  it('sends basic x-access-token, which is the header git actually accepts', () => {
    const token = 'ghp_example';
    const env = pushAuthEnv(token);
    assert.match(env.GIT_CONFIG_VALUE_1, /^AUTHORIZATION: basic /);
    const encoded = env.GIT_CONFIG_VALUE_1.slice('AUTHORIZATION: basic '.length);
    assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), `x-access-token:${token}`);
    assert.equal(env.GIT_CONFIG_COUNT, '2');
    assert.equal(env.GIT_CONFIG_KEY_0, 'credential.helper');
    assert.equal(env.GIT_CONFIG_KEY_1, 'http.extraheader');
  });
});

describe('window bound', () => {
  const now = new Date('2026-09-22T06:00:00.000Z');

  it('places the default shallow bound one day before the 180-day window', () => {
    assert.equal(shallowSinceDate(now), '2026-03-25');
    assert.equal(earlierWindow('window: 400\nboundaries: []\n', now), shallowSinceDate(now, 400));
    assert.equal(earlierWindow('window: "2026-06-01"\nboundaries: []\n', now), null);
  });
});
