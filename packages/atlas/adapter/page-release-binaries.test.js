import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/release-binaries: releases that build binaries and upload
// them, and one that only creates a release (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/release-binaries');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a release that builds binaries, on the page', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'desktop', globs: ['apps/desktop/**'], role: 'code' },
    { name: 'game', globs: ['src/**'], role: 'code' },
    { name: 'notes', globs: ['notes/**'], role: 'data' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/release-binaries' });
  const data = JSON.parse(page.json);
  const door = (file) => data.doors.find((entry) => entry.file === file);

  it('says what comes in builds the binary, apart from what it runs and checks', () => {
    assert.match(page.markdown, /\*\*Release Binaries\.\*\* When a release is published; or by hand\. Builds src\/main\.rs; checks src\/lib\.rs\./);
    assert.deepEqual(door('.github/workflows/release.yml').builds, ['src/main.rs']);
    assert.deepEqual(door('.github/workflows/release.yml').runs, []);
  });

  it('says what the release builds and uploads, per target, and never that it creates the release', () => {
    assert.deepEqual(door('.github/workflows/release.yml').sends, ['builds src/main.rs into an MSIX package and binaries for linux-x64 and win-x64, and uploads them to the release']);
    assert.deepEqual(door('.github/workflows/desktop.yml').sends, ['builds apps/desktop/src-tauri/src/main.rs into MSI and NSIS installers and uploads them to the release']);
    assert.ok(!page.markdown.includes('Release Binaries** creates') && !/Release Desktop[^\n]*creates a GitHub release/.test(page.markdown), page.markdown);
  });

  it('names the files an upload of no build here hands over', () => {
    assert.deepEqual(door('.github/workflows/notes.yml').sends, ['uploads SHA256SUMS.txt, dist/*, sbom.json and files named at run time to the release']);
  });

  it('keeps a release created on a tag push', () => {
    assert.deepEqual(door('.github/workflows/tag.yml').sends, ['creates a GitHub release']);
  });
});

describe('a binary a release builds, explained', () => {
  it('says the release builds the file into a binary, and does not run it', async () => {
    const { spawnSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = spawnSync(process.execPath, [cli, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    const result = spawnSync(process.execPath, [cli, 'explain', 'src/main.rs'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.split('\n')[1], 'Run by mile; built into a binary by Release Binaries.', result.stdout);
  });
});
