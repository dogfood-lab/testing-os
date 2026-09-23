import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { buildArtifact, serializeArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/build-config: bin and exports point into dist/, which only
// tsconfig.build.json (named by the build script, extending tsconfig.json)
// maps back to src/; a second bin points into out/, which no tracked config
// builds; and a script imports ../dist/index.js. dist/ and out/ are ignored.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/build-config');
const BOUNDARIES = [
  { name: 'src', globs: ['src/**'] },
  { name: 'scripts', globs: ['scripts/**'] },
  { name: 'root', globs: ['*'] },
];
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function serialized(root) {
  return serializeArtifact(buildArtifact(mapRepository({ repoPath: root, boundaries: BOUNDARIES }), '0'.repeat(40)));
}

// What a build leaves behind, untracked, with source maps that name a
// different source than the build config does: were the map read, the answer
// would move with what happens to be on disk.
function build(root) {
  mkdirSync(join(root, 'dist', 'bin'), { recursive: true });
  mkdirSync(join(root, 'out'), { recursive: true });
  for (const [path, source] of [['dist/index.js', '../src/other.ts'], ['dist/bin/tool.js', '../../src/other.ts']]) {
    writeFileSync(join(root, path), 'export {};\n');
    writeFileSync(join(root, `${path}.map`), JSON.stringify({ version: 3, sources: [source], mappings: '' }));
  }
  writeFileSync(join(root, 'out/legacy.js'), 'export {};\n');
}

describe('a declared build output', () => {
  it('is traced to its source through the config the build script names, on a clean clone', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const { doors } = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
    const tool = doors.find((door) => door.kind === 'command' && door.name === 'tool');
    assert.deepEqual(tool.runs.map((run) => run.path), ['src/bin/tool.ts']);
    const pkg = doors.find((door) => door.kind === 'package');
    assert.deepEqual(pkg.runs.map((run) => run.path), ['src/index.ts']);
  });

  it('keeps a door whose output no tracked config places, naming the manifest path', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const { doors } = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
    const legacy = doors.find((door) => door.kind === 'command' && door.name === 'legacy');
    assert.ok(legacy, doors.map((door) => door.name).join(', '));
    assert.equal(legacy.unplaced, 'out/legacy.js');
    assert.deepEqual(legacy.runs, []);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: BOUNDARIES }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/build-config' });
    assert.match(markdown, /\*\*legacy\*\* \(a command people run\)\. Runs out\/legacy\.js, built from a source this map cannot place\./);
  });

  it('resolves an import of the output to the same source whether or not it was built', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const use = () => mapRepository({ repoPath: root, boundaries: BOUNDARIES }).boundaries
      .find((boundary) => boundary.name === 'scripts').files.find((file) => file.path === 'scripts/use.mjs').imports[0].resolved;
    assert.deepEqual(use(), { outcome: 'file', path: 'src/index.ts' });
    build(root);
    assert.deepEqual(use(), { outcome: 'file', path: 'src/index.ts' });
  });

  it('maps to the same bytes with and without dist/ on disk', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const clean = serialized(root);
    build(root);
    assert.equal(serialized(root), clean);
  });
});
