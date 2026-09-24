import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { buildArtifact, serializeArtifact } from '../adapter/artifact.js';
import { mapRepository } from './index.js';
import { DOORS, makeRepo } from './fixture-repo.js';

const BOUNDARIES = parse(readFileSync(join(DOORS, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries.map((boundary) => ({
  name: boundary.name,
  globs: boundary.globs,
  status: boundary.status,
  role: boundary.role,
}));

const roots = [];
let mapped;

function map() {
  const root = makeRepo(DOORS);
  roots.push(root);
  return mapRepository({ repoPath: root, boundaries: BOUNDARIES });
}

function file(path) {
  const found = [...mapped.boundaries.flatMap((boundary) => boundary.files), ...mapped.unassigned].find((item) => item.path === path);
  assert.ok(found, path);
  return found;
}

function door(name) {
  const found = mapped.doors.find((item) => item.file === `.github/workflows/${name}`);
  assert.ok(found, name);
  return found;
}

function landing(target) {
  return mapped.landings.find((item) => item.target === target);
}

before(() => {
  mapped = map();
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('landings per file', () => {
  it('reduces a template literal to the tracked directory its head spells out', () => {
    assert.deepEqual(
      file('tools/ingest.js').writes.filter((write) => write.call === 'writeFileSync'),
      [{ target: 'records', call: 'writeFileSync', confidence: 'ast' }],
    );
  });

  it('lands a rename on its destination, and a literal that names nothing tracked nowhere', () => {
    assert.deepEqual(file('tools/ingest.js').writes, [
      { target: 'indexes/latest.json', call: 'renameSync', confidence: 'ast' },
      { target: 'records', call: 'writeFileSync', confidence: 'ast' },
    ]);
    assert.equal(file('tools/ingest.js').dynamicWrites, 0);
  });

  it('reads through a path join of literal segments, and lands an untracked file write on the file', () => {
    assert.deepEqual(file('tools/render.js').reads, [{ target: 'indexes/latest.json', call: 'readFileSync', confidence: 'ast' }]);
    assert.deepEqual(file('tools/render.js').writes, [{ target: 'reports/out.md', call: 'writeFileSync', confidence: 'ast' }]);
  });

  it('reads a literal path handed straight to a read call', () => {
    assert.deepEqual(file('lib/verify.js').reads, [{ target: 'policies/global.yaml', call: 'readFileSync', confidence: 'ast' }]);
  });

  it('reads Python open with a write mode as a write, and a pathlib join as a read', () => {
    assert.deepEqual(file('tools/report.py').writes, [{ target: 'reports/out.json', call: 'open', confidence: 'ast' }]);
    assert.deepEqual(file('tools/report.py').reads, [{ target: 'indexes/latest.json', call: 'read_text', confidence: 'ast' }]);
  });

  it('counts a write to a path the command line names as outside, without naming it', () => {
    const prepare = file('tools/prepare.js');
    assert.deepEqual(prepare.writes, []);
    assert.equal(prepare.dynamicWrites, 0);
    assert.equal(prepare.outsideWrites, 1);
    assert.deepEqual(prepare.reads, []);
    assert.equal(prepare.dynamicReads, 0);
  });

  it('scans a page it does not parse for quoted paths and raw URLs, at text confidence', () => {
    assert.deepEqual(file('site/index.html').reads, [
      { target: 'indexes/latest.json', call: 'literal', confidence: 'text' },
      { target: 'indexes/latest.json', call: 'raw-url', ref: 'main', repo: 'acme/hub', confidence: 'text' },
    ]);
    assert.deepEqual(file('site/index.html').writes, []);
  });

  it('leaves a workflow to its door rather than scanning it as text', () => {
    assert.deepEqual(file('.github/workflows/ingest.yml').reads, []);
  });
});

describe('landings per door', () => {
  it('lands the ingest door on what it stages and on what its reach writes', () => {
    assert.deepEqual(door('ingest.yml').stages, ['indexes/', 'records/']);
    assert.deepEqual(door('ingest.yml').landings, ['indexes', 'indexes/latest.json', 'records']);
  });

  it('lands a door only on what its own reach writes', () => {
    assert.deepEqual(door('weekly.yml').landings, ['reports/out.md']);
    assert.deepEqual(door('manual.yaml').landings, []);
    assert.equal(door('broken.yml').landings, undefined);
  });

  it('names the readers of a door landing and of the paths under it', () => {
    const readers = door('ingest.yml').readers.filter((entry) => entry.target === 'indexes');
    assert.deepEqual(
      readers.map((entry) => entry.by),
      ['.github/workflows/ingest.yml', 'site/index.html', 'site/index.html', 'tools/ingest.js', 'tools/render.js', 'tools/report.py'],
    );
    assert.deepEqual(door('ingest.yml').readers.filter((entry) => entry.target === 'records'), []);
  });
});

describe('landings across the map', () => {
  it('lists the writers of each place, files and doors alike', () => {
    assert.deepEqual(landing('records').writers, [
      { by: '.github/workflows/ingest.yml' },
      { by: 'tools/ingest.js', confidence: 'ast' },
      { by: 'tools/scratch.js', confidence: 'ast' },
    ]);
    assert.deepEqual(landing('indexes').writers, [{ by: '.github/workflows/ingest.yml' }]);
    assert.deepEqual(landing('indexes/latest.json').writers, [{ by: 'tools/ingest.js', confidence: 'ast' }]);
    assert.deepEqual(landing('reports/out.md').writers, [{ by: 'tools/render.js', confidence: 'ast' }]);
    assert.deepEqual(landing('reports/out.json').writers, [{ by: 'tools/report.py', confidence: 'ast' }]);
    assert.equal(landing('reports'), undefined);
    assert.equal(landing('policies'), undefined);
  });

  it('marks a bare root file name under an unread root weak, and keeps a bare directory name full', () => {
    // tools/scratch.js writes join(dir, '.gitignore') and join(dir, 'records', ...),
    // with dir a root the engine cannot read. The first matches the tracked
    // root .gitignore only by name; the second names the tracked records/
    // directory.
    assert.deepEqual(landing('.gitignore').writers, [{ by: 'tools/scratch.js', confidence: 'weak' }]);
    assert.ok(landing('records').writers.some((entry) => entry.by === 'tools/scratch.js' && entry.confidence === 'ast'));
    const scratch = file('tools/scratch.js');
    assert.deepEqual(scratch.writes.map((write) => [write.target, write.confidence]), [['.gitignore', 'weak'], ['records', 'ast']]);
    const origin = Object.fromEntries(mapped.boundaries.map((boundary) => [boundary.name, boundary.origin]));
    assert.equal(origin.tools, 'authored');
  });

  it('lists every reader of indexes/latest.json: code, script, page and door', () => {
    assert.deepEqual(landing('indexes/latest.json').readers, [
      { by: '.github/workflows/ingest.yml' },
      { by: 'site/index.html', call: 'literal', confidence: 'text' },
      { by: 'site/index.html', call: 'raw-url', confidence: 'text', ref: 'main', repo: 'acme/hub' },
      { by: 'tools/ingest.js', call: 'existsSync', confidence: 'ast' },
      { by: 'tools/render.js', call: 'readFileSync', confidence: 'ast' },
      { by: 'tools/report.py', call: 'read_text', confidence: 'ast' },
    ]);
    assert.deepEqual(landing('policies/global.yaml'), {
      target: 'policies/global.yaml',
      writers: [],
      readers: [{ by: 'lib/verify.js', call: 'readFileSync', confidence: 'ast' }],
    });
  });

  it('calls a boundary generated, authored or mixed from who writes inside it', () => {
    const origin = Object.fromEntries(mapped.boundaries.map((boundary) => [boundary.name, boundary.origin]));
    assert.equal(origin.records, 'generated');
    assert.equal(origin.indexes, 'generated');
    assert.equal(origin.reports, 'generated');
    assert.equal(origin.policies, 'authored');
    assert.equal(origin.lib, 'authored');
    assert.equal(origin.tools, 'authored');
  });

  it('carries landings, door landings and origin into the artifact byte for byte from a second copy', () => {
    const first = serializeArtifact(buildArtifact(mapped, 'fixture'));
    const second = serializeArtifact(buildArtifact(map(), 'fixture'));
    assert.equal(second, first);
    const artifact = JSON.parse(first);
    assert.deepEqual(
      artifact.landings.map((item) => item.target),
      ['.gitignore', 'cache/state.json', 'indexes', 'indexes/latest.json', 'package.json', 'policies/global.yaml', 'records', 'reports/out.json', 'reports/out.md'],
    );
    assert.deepEqual(artifact.doors.find((item) => item.file === '.github/workflows/ingest.yml').landings, [
      'indexes',
      'indexes/latest.json',
      'records',
    ]);
    assert.equal(artifact.boundaries.find((item) => item.name === 'records').origin, 'generated');
  });
});
