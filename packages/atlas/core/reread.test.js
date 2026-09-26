import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DOORS, makeRepo } from './fixture-repo.js';
import { mapRepository, rereadFiles } from './index.js';
import { loadsManifest } from './languages.js';

/**
 * The scoped re-read reads a file with the same per-file code a full map
 * uses, so for a file nothing changed in, it finds what the map found: the
 * same resolved imports, the same writes and the same reads.
 */

const BOUNDARIES = [
  { name: 'indexes', globs: ['indexes/**'] },
  { name: 'lib', globs: ['lib/**'] },
  { name: 'policies', globs: ['policies/**'] },
  { name: 'records', globs: ['records/**'] },
  { name: 'reports', globs: ['reports/**'] },
  { name: 'site', globs: ['site/**'] },
  { name: 'tools', globs: ['tools/**'] },
  { name: 'workflows', globs: ['.github/**'] },
];
const FILES = ['tools/ingest.js', 'tools/render.js', 'tools/report.py', 'lib/verify.js', 'lib/store.js'];
const CALLERS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/reread-callers');

let root;
let mapped;

before(() => {
  root = makeRepo(DOORS);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function fileOf(path) {
  return [...mapped.boundaries.flatMap((boundary) => boundary.files), ...mapped.unassigned].find((file) => file.path === path);
}

function importTargets(imports) {
  return [...new Set(imports.filter((site) => !loadsManifest(site) && site.resolved?.outcome === 'file').map((site) => site.resolved.path))].sort();
}

function targets(entries) {
  return [...new Set(entries.map((entry) => `${entry.target} ${entry.confidence}`))].sort();
}

describe('a scoped re-read', () => {
  it('finds, for files nothing changed in, the imports, writes and reads the full map found', () => {
    const readings = rereadFiles({ repoPath: root, boundaries: BOUNDARIES, paths: FILES });
    assert.deepEqual(readings.map((reading) => reading.path), FILES);
    for (const reading of readings) {
      const file = fileOf(reading.path);
      assert.deepEqual(importTargets(reading.imports), importTargets(file.imports), `${reading.path} imports`);
      assert.deepEqual(targets(reading.writes), targets(file.writes ?? []), `${reading.path} writes`);
      assert.deepEqual(targets(reading.reads), targets(file.reads ?? []), `${reading.path} reads`);
      assert.deepEqual(reading.parts, [mapped.boundaries.find((boundary) => boundary.files.includes(file)).name]);
    }
  });

  it('reads a file as it is now, or as the content it is handed', () => {
    const path = 'tools/render.js';
    writeFileSync(join(root, path), "import { writeFileSync } from 'node:fs';\nwriteFileSync('reports/now.md', 'x');\n");
    const [now] = rereadFiles({ repoPath: root, boundaries: BOUNDARIES, paths: [path] });
    assert.deepEqual(targets(now.writes), ['reports/now.md ast']);
    const [then] = rereadFiles({
      repoPath: root,
      boundaries: BOUNDARIES,
      paths: [path],
      content: () => Buffer.from("import { writeFileSync } from 'node:fs';\nwriteFileSync('reports/then.md', 'x');\n"),
    });
    assert.deepEqual(targets(then.writes), ['reports/then.md ast']);
  });

  it('settles a path a file is handed through a parameter in the files that call it', () => {
    const repo = makeRepo(CALLERS);
    try {
      const parts = [{ name: 'lib', globs: ['lib/**'] }, { name: 'tools', globs: ['tools/**'] }, { name: 'reports', globs: ['reports/**'] }];
      const full = mapRepository({ repoPath: repo, boundaries: parts });
      const emit = full.boundaries.find((boundary) => boundary.name === 'lib').files[0];
      assert.deepEqual(targets(emit.writes), ['reports/out.json ast'], 'the full map follows the parameter to its caller');
      const [settled] = rereadFiles({ repoPath: repo, boundaries: parts, paths: ['lib/emit.js'], callersOf: () => ['tools/run.js'] });
      assert.deepEqual(targets(settled.writes), targets(emit.writes));
      const [alone] = rereadFiles({ repoPath: repo, boundaries: parts, paths: ['lib/emit.js'] });
      assert.deepEqual(alone.writes, [], 'with no caller named, the path is the caller\'s');
      assert.deepEqual(alone.outsideWhere, [{ kind: 'write', where: ['caller'] }]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('reads a new file that is not yet tracked, and skips one that is not there', () => {
    writeFileSync(join(root, 'tools', 'fresh.js'), "import { verify } from '../lib/verify.js';\nexport const fresh = () => verify();\n");
    const readings = rereadFiles({ repoPath: root, boundaries: BOUNDARIES, paths: ['tools/fresh.js', 'tools/gone.js'] });
    assert.deepEqual(readings.map((reading) => reading.path), ['tools/fresh.js']);
    assert.deepEqual(importTargets(readings[0].imports), ['lib/verify.js']);
    assert.deepEqual(readings[0].parts, ['tools']);
  });
});
