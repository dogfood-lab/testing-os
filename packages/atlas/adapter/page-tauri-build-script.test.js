import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/tauri-build-script: a Tauri crate whose build script writes
// the tracked gen/schemas/ on every build (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/tauri-build-script');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a Tauri crate\'s build script', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'app', globs: ['app/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/tauri-build-script' });
  const door = (file) => structure.doors.find((entry) => entry.file === file);

  it('reads tauri_build::build() as a write of the crate\'s gen/schemas/', () => {
    const landing = structure.landings.find((item) => item.target === 'app/src-tauri/gen/schemas');
    assert.deepEqual(landing?.writers.map((entry) => entry.by), ['app/src-tauri/build.rs'], JSON.stringify(structure.landings));
  });

  it('runs the build script on every build or check of the crate, so each door writes there', () => {
    for (const file of ['.github/workflows/desktop.yml', '.github/workflows/ci.yml']) {
      assert.ok(door(file).runs.some((run) => run.path === 'app/src-tauri/build.rs' && run.runKind === 'executes'), JSON.stringify(door(file).runs));
      assert.deepEqual(door(file).landings, ['app/src-tauri/gen/schemas']);
    }
  });

  it('lists gen/schemas/ as generated, written by a build script', () => {
    assert.ok(page.markdown.includes('- **app/src-tauri/gen/schemas/** is written by app/src-tauri/build.rs (a build script).'), page.markdown);
  });
});
