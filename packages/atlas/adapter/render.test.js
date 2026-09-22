import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { readBoundaryFile } from './boundary-file.js';
import { renderAll, withdrawStamp } from './render.js';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const HOST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/host');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DAY = 86400000;
const roots = [];

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function hostRepo() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-render-'));
  roots.push(root);
  cpSync(HOST, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'host']);
  const mapped = atlas(root, ['map']);
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  return root;
}

function load(root) {
  return {
    structure: JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8')),
    statistics: JSON.parse(readFileSync(join(root, 'atlas', 'statistics.json'), 'utf8')),
    document: readBoundaryFile(root),
  };
}

function renderHost(root, patch = {}) {
  const loaded = load(root);
  const statistics = patch.statistics ? patch.statistics(loaded.statistics) : loaded.statistics;
  const structure = patch.structure ? patch.structure(loaded.structure) : loaded.structure;
  const document = patch.document ? patch.document(loaded.document) : loaded.document;
  const now = patch.now ?? new Date(statistics.generatedAt);
  return renderAll({
    structure,
    statistics,
    document,
    now,
    testCommand: patch.testCommand ?? "run this repository's tests",
    publicRepository: patch.publicRepository === true,
  });
}

function boundary(name, extras = {}) {
  return {
    name,
    status: extras.status ?? 'accepted',
    role: extras.role ?? 'code',
    globs: [`${name}/**`],
    entryPoints: extras.entryPoints ?? [`${name}/index.js`],
    files: extras.files ?? [{ path: `${name}/index.js`, hash: 'aa' }],
    unresolvedSites: extras.unresolvedSites ?? 0,
    importConfidence: extras.importConfidence ?? 'full',
  };
}

function snapshot(names, extras = {}) {
  const boundaries = names.map((name) => boundary(name, extras.boundary?.[name] ?? {}));
  return {
    structure: {
      boundaries,
      edges: extras.edges ?? [],
      unassigned: extras.unassigned ?? [],
      overlaps: [],
      submodules: [],
      symlinks: [],
      generatedFrom: { commit: 'a4f1c2e000000000000000000000000000000000', tracked: boundaries.length },
    },
    statistics: {
      generatedAt: '2026-09-14T09:12:00.000Z',
      generatedFrom: { commit: 'a4f1c2e000000000000000000000000000000000' },
      confidence: extras.confidence ?? { level: 'full', reason: 'the window holds at least 30 qualifying commits' },
      pairs: extras.pairs ?? [],
      churn: { definition: 'lines', files: extras.churn ?? [] },
      boundaries: names.map((name) => ({
        name,
        cohesion: extras.cohesion?.[name] ?? null,
        highWater: null,
        cohesionDropped: extras.dropped?.includes(name) ?? false,
        rebaseline: null,
        breakage: extras.breakage?.[name] ?? {
          collapsed: false,
          confidence: 'full',
          importsAndCoChanges: [],
          importsOnly: [],
          coChangesOnly: [],
        },
      })),
    },
    document: {
      summary: extras.summary === undefined ? 'synthetic' : extras.summary,
      machine_budget: extras.machine_budget === undefined ? 2500 : extras.machine_budget,
      boundaries: names.map((name) => ({
        name,
        status: (extras.boundary?.[name] ?? {}).status ?? 'accepted',
        role: (extras.boundary?.[name] ?? {}).role ?? 'code',
        will_break: extras.willBreak?.[name] ?? `${name} breaks here`,
        will_break_from: extras.willFrom?.[name] ?? 'human',
        ...(extras.startHere?.[name] ? { start_here: extras.startHere[name] } : {}),
        ...(extras.rebaseline?.[name] ? { rebaseline: extras.rebaseline[name] } : {}),
      })),
    },
  };
}

function draw(input, now = new Date('2026-09-22T09:12:00.000Z')) {
  return renderAll({ ...input, now, testCommand: input.testCommand ?? 'npm test', publicRepository: input.publicRepository === true });
}

function assertOrder(text, markers) {
  let at = -1;
  for (const marker of markers) {
    const next = text.indexOf(marker);
    assert.ok(next > at, marker);
    at = next;
  }
}

function assertMermaid(markdown) {
  const fences = markdown.match(/```/g) ?? [];
  assert.equal(fences.length % 2, 0);
  const blocks = [...markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)];
  assert.ok(blocks.length >= 1);
  for (const block of blocks) {
    const body = block[1];
    assert.equal(body.includes('%%{init'), false);
    assert.equal(/#[0-9A-Fa-f]{3,8}\b/.test(body), false);
    const declared = new Set();
    for (const line of body.split('\n')) {
      const decl = /^([A-Za-z_][A-Za-z0-9_]*)\[/.exec(line);
      if (decl) declared.add(decl[1]);
      const edge = /^([A-Za-z_][A-Za-z0-9_]*) (?:-->|-.->)/.exec(line);
      if (!edge) continue;
      assert.ok(declared.has(edge[1]), line);
      const target = /(?:-->|-.->)(?:\|chunk\|)? ([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
      assert.ok(target && declared.has(target[1]), line);
    }
  }
}

function mermaidOf(markdown) {
  const block = markdown.match(/```mermaid\n([\s\S]*?)```/);
  assert.ok(block);
  return block[1];
}

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas renders', () => {
  it('writes Orientation in the design reading order for the host fixture', () => {
    const root = hostRepo();
    const orientation = readFileSync(join(root, 'atlas', 'orientation.md'), 'utf8');
    const again = renderHost(root);
    assert.equal(orientation, again.orientation);
    assert.equal(orientation.startsWith('◷ numbers as of '), true);
    assertOrder(orientation, [
      '◷ numbers as of',
      '## What this is',
      'a small host fixture',
      '3 boundaries. 0 still unnamed.',
      'If you maintain this repository: this is the map you would draw from memory, checked against the tree. Start where it disagrees with you.',
      'If you are new here: you have not opened this repository before. Start with the three actions below; each one tells you what to expect.',
      '```mermaid',
      '## Legend',
      '────────▶   import        one boundary statically imports another',
      '1. OPEN pkg/beta/index.js',
      '2. RUN run this repository\'s tests',
      'passes when: exit 0',
      '3. BREAK the tests boundary fails when this export changes',
      'tests that cover it: tests (1 file)',
      '## What you will break — beta',
      '## Still unnamed',
      'atlas/boundaries.yaml',
    ]);
    const command = orientation.split('\n').find((line) => line.startsWith('2. RUN'));
    const condition = orientation.split('\n').find((line) => line.includes('passes when'));
    assert.equal(condition.trim(), 'passes when: exit 0');
    assert.equal(/\d/.test(command.replace(/^2\. RUN /, '')), false);
    assert.doesNotMatch(orientation, /passing/);
    assert.doesNotMatch(orientation, /opacity/);
    assert.match(orientation, /⚠           low confidence: the words "low confidence" precede every number that rests on the fallen floor/);
    assert.doesNotMatch(orientation, /## Roster|## Pairs|## Hotspots|The matrix is on the site/);
    assert.equal(orientation.includes('<details'), false);
    const breakage = orientation.slice(orientation.indexOf('## What you will break'));
    assert.match(breakage, /^## What you will break — beta\n\n◷ /);
    assertMermaid(orientation);
    assert.match(mermaidOf(orientation), /classDef unassigned stroke-dasharray: 4 3/);
    assert.match(mermaidOf(orientation), /unassigned\["· unassigned · 2"\]:::unassigned/);
  });

  it('counts a boundary\'s own tests and a test boundary that imports it', () => {
    const root = hostRepo();
    const orientation = readFileSync(join(root, 'atlas', 'orientation.md'), 'utf8');
    assert.match(orientation, /tests that cover it: tests \(1 file\)/);
    const alpha = renderHost(root, { structure: (structure) => ({ ...structure, edges: [] }) });
    assert.match(alpha.orientation, /## What you will break — alpha/);
    assert.match(alpha.orientation, /tests that cover it: not covered by any test boundary/);
    const both = snapshot(['schemas', 'checks'], {
      boundary: {
        schemas: {
          role: 'code',
          files: [
            { path: 'packages/schemas/src/index.ts', hash: 'a' },
            { path: 'packages/schemas/test/read.test.ts', hash: 'b' },
          ],
        },
        checks: {
          role: 'test',
          files: [
            { path: 'checks/one.test.js', hash: 'c' },
            { path: 'checks/two.test.js', hash: 'd' },
          ],
        },
      },
      edges: [{ from: 'checks', to: 'schemas', kind: 'file' }],
      willFrom: { schemas: 'derived' },
      willBreak: { schemas: 'Changing this breaks checks; covered by tests in checks, schemas' },
    });
    const text = draw(both).orientation;
    assert.match(text, /3\. BREAK Changing this breaks checks; covered by tests in checks, schemas \(derived\)/);
    assert.match(text, /tests that cover it: its own \(1 file\) · checks \(2 files\)/);
    assert.doesNotMatch(text, /not covered by any test boundary/);
    const dev = draw(both).dev;
    assert.match(dev, /⚠           low confidence: the words "low confidence" precede every number that rests on the fallen floor/);
    assert.doesNotMatch(`${text}\n${dev}`, /opacity/);
  });

  it('chooses the accepted boundary with the most fan-in, and the name-first accepted boundary on a tie', () => {
    const tied = snapshot(['beta', 'alpha', 'gamma'], {
      boundary: { gamma: { status: 'proposed' } },
      edges: [{ from: 'gamma', to: 'gamma', kind: 'file' }],
    });
    tied.structure.edges = [{ from: 'outside', to: 'gamma', kind: 'file' }];
    const tiedRender = draw(tied);
    assert.match(tiedRender.orientation, /## What you will break — alpha/);
    const proposed = snapshot(['alpha', 'gamma'], {
      boundary: { alpha: { status: 'proposed' }, gamma: { status: 'proposed' } },
      edges: [{ from: 'alpha', to: 'gamma', kind: 'file' }],
    });
    assert.match(draw(proposed).orientation, /## What you will break — gamma/);
  });

  it('caps the filtered map at eight neighbours, with the overflow tile and the unassigned tile outside that cap', () => {
    const names = ['hub', ...Array.from({ length: 10 }, (_, i) => `n${i}`)];
    const input = snapshot(names, {
      edges: names.slice(1).map((name) => ({ from: name, to: 'hub', kind: 'file' })),
      unassigned: [{ path: 'loose.txt', hash: 'bb' }],
    });
    const diagram = mermaidOf(draw(input).orientation);
    for (let i = 0; i < 8; i += 1) assert.match(diagram, new RegExp(`n${i} · 1`));
    assert.doesNotMatch(diagram, /n8 · 1/);
    assert.doesNotMatch(diagram, /n9 · 1/);
    assert.match(diagram, /\+ 2 more/);
    assert.match(diagram, /unassigned\["· unassigned · 1"\]:::unassigned/);
    assert.match(draw(input).orientation, /\[\+ 2 more\]\(atlas\/dev\.md\)/);
    assertMermaid(draw(input).orientation);
  });

  it('uses the unnamed line when the summary is empty', () => {
    const input = snapshot(['alpha'], { summary: '' });
    assert.match(draw(input).orientation, /unnamed: what this repository is\n1 boundary\. 0 still unnamed\./);
    const host = hostRepo();
    assert.equal(readFileSync(join(host, 'atlas', 'orientation.md'), 'utf8').includes('unnamed: what this repository is'), false);
  });

  it('puts the low-confidence words on statistical sections and on a low-confidence import line', () => {
    const root = hostRepo();
    const rendered = renderHost(root, {
      statistics: (statistics) => ({ ...statistics, confidence: { level: 'low', reason: 'fewer than 30 qualifying commits in the window' } }),
      structure: (structure) => ({
        ...structure,
        boundaries: structure.boundaries.map((item) => (item.name === 'beta' ? { ...item, importConfidence: 'low' } : item)),
      }),
    });
    const breakage = rendered.orientation.slice(rendered.orientation.indexOf('## What you will break'));
    assert.match(breakage, /⚠ low confidence/);
    assert.match(rendered.dev.slice(rendered.dev.indexOf('## Hotspots')), /⚠ low confidence/);
    assert.match(rendered.stats, /⚠ low confidence/);
    const coarse = rendered.machine.split('## Fine')[0];
    const beta = coarse.split('\n').find((line) => line.startsWith('beta  '));
    assert.match(beta, /⚠ low confidence {2}imports →/);
    assert.equal(rendered.machine.includes('opacity:'), false);
  });

  it('sorts the Dev hotspot table by churn descending and parses its Mermaid', () => {
    const input = snapshot(['alpha', 'beta', 'tests'], {
      churn: [
        { path: 'alpha/index.js', commits: 1, lines: 2 },
        { path: 'beta/index.js', commits: 4, lines: 9 },
        { path: 'tests/index.js', commits: 2, lines: 5 },
      ],
      boundary: { tests: { role: 'test', files: [{ path: 'tests/index.js', hash: 'aa' }] } },
    });
    const dev = draw(input).dev;
    const rows = dev.slice(dev.indexOf('## Hotspots'), dev.indexOf('## Breakage')).split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| ---') && !line.startsWith('| boundary'));
    assert.deepEqual(rows.map((row) => row.split('|')[1].trim()), ['beta', 'tests', 'alpha']);
    assert.match(dev, /churn is the sum of lines, added plus deleted, over the boundary's files\./);
    assertMermaid(dev);
    assert.match(dev, /<details>\n<summary>Legend<\/summary>/);
    const wide = snapshot(Array.from({ length: 21 }, (_, i) => `b${i}`));
    const wideDev = draw(wide).dev;
    const mapAt = wideDev.indexOf('## Map');
    assert.ok(wideDev.indexOf('The matrix is on the site.') > mapAt);
    assert.ok(wideDev.indexOf('```mermaid') > wideDev.indexOf('The matrix is on the site.'));
    const exact = snapshot(Array.from({ length: 20 }, (_, i) => `b${i}`));
    assert.equal(draw(exact).dev.includes('The matrix is on the site.'), false);
  });

  it('writes Machine\'s first six lines, keeps the coarse section when the budget is tiny, and stamps the stats hash', () => {
    const empty = snapshot([]);
    empty.structure.boundaries = [];
    empty.statistics.boundaries = [];
    const drawn = draw(empty);
    const lines = drawn.machine.split('\n');
    const hash = createHash('sha256').update(drawn.stats).digest('hex');
    assert.deepEqual(lines.slice(0, 6), [
      'generated: a4f1c2e  2026-09-14T09:12:00.000Z',
      'structure: 0 boundaries · 0 unassigned · 0 unresolved sites',
      `statistics: atlas/machine-stats.txt · sha256 ${hash} · withdraw-after: ${withdrawStamp('2026-09-14T09:12:00.000Z')}`,
      'rule: if now (UTC) is after withdraw-after, do not load the statistics file;',
      '      withdrawn numbers are not evidence that files are uncoupled',
      'confidence: full',
    ]);
    assert.equal(withdrawStamp('2026-09-14T09:12:00.000Z'), '2026-10-12T09:12:00.000Z');
    assert.equal(drawn.stats.startsWith('rule: if now (UTC) is after withdraw-after, do not load the statistics file;\n'), true);
    assert.doesNotMatch(`${drawn.machine}\n${drawn.stats}`, /\bnpm\b|\bgit\b|atlas map/);
    const tiny = snapshot(['alpha', 'beta'], { machine_budget: 1 });
    const machine = draw(tiny).machine;
    const coarse = machine.slice(machine.indexOf('## Coarse'), machine.indexOf('## Fine'));
    assert.match(coarse, /^## Coarse\nalpha /);
    assert.match(coarse, /\nbeta /);
    assert.match(machine, /<!-- tokens estimated as characters divided by four -->/);
    assert.match(machine, /truncated: 2 boundaries omitted/);
    const full = draw(snapshot(['alpha'])).machine;
    assert.equal(full.includes('truncated:'), false);
    assert.match(full, /<!-- tokens estimated as characters divided by four -->/);
  });

  it('says the numbers are historical past 28 days, and names the central page only for a public repository', () => {
    const input = snapshot(['alpha']);
    const generated = Date.parse(input.statistics.generatedAt);
    const onTheDay = draw({ ...input, publicRepository: true }, new Date(generated + 28 * DAY));
    assert.doesNotMatch(onTheDay.orientation, /historical/);
    const later = draw({ ...input, publicRepository: true }, new Date(generated + 28 * DAY + 60 * 1000));
    assert.match(later.orientation, /historical · the central page has the newer copy \(a future surface\)/);
    const privateLater = draw(input, new Date(generated + 28 * DAY + 60 * 1000));
    assert.match(privateLater.orientation, /historical/);
    assert.doesNotMatch(privateLater.orientation, /central page/);
  });

  it('marks a derived break sentence and a table that fell to fan-in', () => {
    const input = snapshot(['alpha'], {
      willFrom: { alpha: 'derived' },
      breakage: {
        alpha: { collapsed: true, confidence: 'low', importsAndCoChanges: [], importsOnly: ['beta'], coChangesOnly: [] },
      },
      confidence: { level: 'low', reason: 'fewer than 30 qualifying commits in the window' },
    });
    const orientation = draw(input).orientation;
    assert.match(orientation, /3\. BREAK alpha breaks here \(derived\)/);
    assert.match(orientation, /The table fell to fan-in\./);
    assert.match(orientation, /imports only \| beta/);
  });

  it('fails the check when the stats file is tampered and passes when both machine files are absent', () => {
    const root = hostRepo();
    assert.equal(atlas(root, ['check']).status, 0);
    const stats = join(root, 'atlas', 'machine-stats.txt');
    writeFileSync(stats, `${readFileSync(stats, 'utf8')}\n`);
    const tampered = atlas(root, ['check']);
    assert.equal(tampered.status, 1, tampered.stdout);
    assert.match(tampered.stdout, /ATLAS_MACHINE_HASH_MISMATCH/);
    rmSync(join(root, 'atlas', 'machine.md'));
    rmSync(stats);
    const absent = atlas(root, ['check']);
    assert.equal(absent.status, 0, absent.stdout);
  });

  it('names all six generated files in the engine compensator', () => {
    const dispatch = readFileSync(join(ROOT, 'docs', 'atlas.dispatch.md'), 'utf8');
    for (const name of ['atlas/structure.json', 'atlas/statistics.json', 'atlas/orientation.md', 'atlas/dev.md', 'atlas/machine.md', 'atlas/machine-stats.txt']) {
      assert.ok(dispatch.includes(name), name);
    }
  });
});
