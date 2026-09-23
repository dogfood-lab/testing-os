import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DOORS = resolve(REPO_ROOT, 'fixtures/atlas/doors');
const MAP_LINE = /^Map from commit [0-9a-f]{7}, \d{4}-\d{2}-\d{2}\.$/;
const roots = [];
let doors;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function repoFrom(fixture) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-explain-'));
  roots.push(root);
  if (fixture) cpSync(fixture, root, { recursive: true });
  else writeFileSync(join(root, 'README.md'), 'no map here\n');
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'fixture']);
  return root;
}

function explain(cwd, ...args) {
  const result = spawnSync(process.execPath, [CLI, 'explain', ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, lines: result.stdout.trimEnd().split('\n') };
}

function explained(cwd, ...args) {
  const result = explain(cwd, ...args);
  assert.equal(result.status, 0, result.stdout);
  return result.lines;
}

// Every file under root with its bytes and mtime, .git left out: explain
// shells out to git for the root, and git may touch its own index.
function snapshot(root) {
  const rows = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
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

before(() => {
  doors = repoFrom(DOORS);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: doors, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas explain on the doors fixture', () => {
  it('explains a file a door runs, from its part to its order of work', () => {
    const lines = explained(doors, 'tools/ingest.js');
    assert.deepEqual(lines.slice(0, -1), [
      'tools/ingest.js is in tools (code).',
      'Run by Ingest.',
      'Imports 4 files: lib/policy.js, lib/store.js, lib/verify.js and tools/prepare.js.',
      'No file imports it.',
      'Its part imports 1 part: lib.',
      'No other part imports its part.',
      'Writes to indexes/latest.json; read by site/index.html (found by text), tools/render.js and tools/report.py.',
      'Writes to records/; nothing in this repository reads it.',
      'Inside it, ingest does, in order: prepare, verify (lib), load policy, write record, rebuild index, audit record and seal record.',
    ]);
    assert.match(lines.at(-1), MAP_LINE);
  });

  it('names the doors whose path runs through the part of a file no door runs', () => {
    const lines = explained(doors, 'lib/store.js');
    assert.equal(lines[0], 'lib/store.js is in lib (code).');
    assert.equal(lines[1], 'On the path of Checks, Ingest, weekly and Manual through lib.');
    assert.equal(lines[5], 'Its part is imported by 1 part: tools.');
    assert.equal(lines[6], 'Inside it, seal record does, in order: check schema, check policy, load schema, load policy and schema version.');
  });

  it('names the files a file imports, the files that import it, and its own test', () => {
    const lines = explained(doors, 'lib/verify.js');
    assert.deepEqual(lines.slice(2, 5), [
      'Imports 2 files: lib/policy.js and lib/schema.js.',
      // Production importers come before tests, so a cut list keeps the code.
      'Imported by 2 files, 1 of them a test: tools/ingest.js and lib/verify.test.js.',
      'Its own test is lib/verify.test.js.',
    ]);
    const facts = JSON.parse(explain(doors, 'lib/verify.js', '--json').stdout);
    assert.deepEqual(facts.importsFiles, ['lib/policy.js', 'lib/schema.js']);
    assert.deepEqual(facts.importedByFiles, ['tools/ingest.js', 'lib/verify.test.js']);
    assert.equal(facts.importedByTestFiles, 1);
    assert.deepEqual(facts.ownTests, ['lib/verify.test.js']);
    assert.deepEqual(facts.reexportsAll, []);
  });

  it('says a file is in no part, and still names the door that runs it', () => {
    const lines = explained(doors, 'packages/cli/check.js');
    assert.deepEqual(lines.slice(0, -1), [
      'packages/cli/check.js is not in any part.',
      'Run by Checks.',
      'Imports no file in this repository.',
      'No file imports it.',
      'No order of work is recorded; only files a door runs, and the files they call, carry one.',
    ]);
  });

  it('explains a directory by the part its files are in, and says so first', () => {
    const lines = explained(doors, './tools/');
    // The fixture's tools folder grows with other slices; count it rather than pin it.
    const toolFiles = readdirSync(join(doors, 'tools')).filter((name) => statSync(join(doors, 'tools', name)).isFile()).length;
    assert.equal(lines[0], `tools/ is a directory; its ${toolFiles} files are in tools (code), the part explained here.`);
    assert.equal(lines[1], 'Checks, Ingest and weekly run files in it.');
    assert.ok(lines.includes('Writes to reports/; nothing in this repository reads it.'), lines.join('\n'));
    assert.ok(lines.includes('An order of work is recorded for tools/ingest.js and tools/prepare.js; explain one for its steps.'), lines.join('\n'));
  });

  it('reads a path the way the caller wrote it from inside the tree', () => {
    const lines = explained(join(doors, 'tools'), 'ingest.js');
    assert.equal(lines[0], 'tools/ingest.js is in tools (code).');
    assert.equal(explained(doors, 'tools\\ingest.js')[0], 'tools/ingest.js is in tools (code).');
  });

  it('fails with exit 2 on a path the committed map does not hold', () => {
    const result = explain(doors, 'tools/missing.js');
    assert.equal(result.status, 2);
    assert.deepEqual(result.lines, [
      'ATLAS_EXPLAIN_UNKNOWN_PATH  The path is not in the committed map.',
      '  what changed:   tools/missing.js names no file or directory in atlas/structure.json',
      '  what to do:     check the path, or run atlas map if the file is new',
      'exit 2',
    ]);
  });

  it('fails with exit 2 when nothing has been mapped', () => {
    const result = explain(repoFrom(null), 'README.md');
    assert.equal(result.status, 2);
    assert.equal(result.lines[0], 'ATLAS_EXPLAIN_NO_MAP  There is no committed map to explain from.');
    assert.equal(result.lines[2], '  what to do:     run atlas map and commit atlas/');
  });

  it('prints the same facts as one sorted JSON object with --json', () => {
    const result = explain(doors, 'tools/ingest.js', '--json');
    assert.equal(result.status, 0, result.stdout);
    const facts = JSON.parse(result.stdout);
    assert.equal(result.stdout, `${JSON.stringify(facts, null, 2)}\n`);
    assert.deepEqual(Object.keys(facts), Object.keys(facts).sort());
    for (const field of ['part', 'role', 'doors', 'imports', 'importedBy', 'unresolved', 'writes', 'reads', 'sequence', 'changesWith', 'mapCommit', 'generatedAt']) {
      assert.ok(field in facts, field);
    }
    assert.equal(facts.part, 'tools');
    assert.equal(facts.role, 'code');
    assert.deepEqual(facts.doors, { isDoor: null, onPath: ['Checks', 'Ingest', 'weekly'], runBy: ['Ingest'] });
    assert.equal(facts.importGrain, 'part');
    assert.deepEqual(facts.imports, ['lib']);
    assert.deepEqual(facts.writes, [
      { place: 'indexes/latest.json', readers: ['site/index.html', 'tools/render.js', 'tools/report.py'] },
      { place: 'records/', readers: [] },
    ]);
    assert.equal(facts.sequence.entry, 'ingest');
    assert.equal(facts.sequence.steps.length, 7);
    assert.match(facts.mapCommit, /^[0-9a-f]{40}$/);
  });

  it('writes nothing, in text or in JSON', () => {
    const before = snapshot(doors);
    for (const args of [['tools/ingest.js'], ['tools', '--json'], ['tools/missing.js']]) explain(doors, ...args);
    assert.deepEqual(snapshot(doors), before);
  });
});

describe('atlas explain on this repository', () => {
  it('explains the ingest persist step from the committed map', () => {
    const structure = JSON.parse(readFileSync(join(REPO_ROOT, 'atlas', 'structure.json'), 'utf8'));
    const ingestDoor = structure.doors.find((door) => door.file === '.github/workflows/ingest.yml');
    assert.ok(ingestDoor, 'the ingest workflow is a door');
    const lines = explained(REPO_ROOT, 'packages/ingest/persist.js');
    assert.equal(lines[0], 'packages/ingest/persist.js is in ingest (code).');
    assert.match(lines[1], /^(Run by|On the path of) /);
    assert.ok(lines[1].includes(ingestDoor.name), lines[1]);
    const order = lines.find((line) => line.startsWith('Inside it, '));
    assert.ok(order?.includes('read chain head'), lines.join('\n'));
    assert.match(lines.at(-1), MAP_LINE);

    const facts = JSON.parse(explain(REPO_ROOT, 'packages/ingest/persist.js', '--json').stdout);
    const records = facts.writes.find((write) => write.place === 'records/');
    assert.ok(records, JSON.stringify(facts.writes));
    assert.ok(records.readers.length >= 2, JSON.stringify(records));
  });
});

describe('atlas explain on a repository whose top-level files are a part', () => {
  it('names the root part the repository root, in the lines and beside the ids in JSON', () => {
    const root = repoFrom(resolve(REPO_ROOT, 'fixtures/atlas/root-part'));
    const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    const lines = explained(root, 'lib/core.js');
    assert.ok(lines.includes('Its part is imported by 1 part: the repository root.'), lines.join('\n'));
    const facts = JSON.parse(explain(root, 'lib/core.js', '--json').stdout);
    assert.deepEqual(facts.importedBy, ['root']);
    assert.deepEqual(facts.partLabels, { lib: 'lib', root: 'the repository root' });
    const own = JSON.parse(explain(root, 'index.js', '--json').stdout);
    assert.equal(own.part, 'root');
    assert.deepEqual(own.partLabels, { lib: 'lib', root: 'the repository root', tools: 'tools' });
  });
});
