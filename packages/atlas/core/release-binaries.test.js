import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/release-binaries: releases that build binaries and upload
// them, and one that only creates a release (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/release-binaries');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what a release that builds binaries ships', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'desktop', globs: ['apps/desktop/**'], role: 'code' },
    { name: 'game', globs: ['src/**'], role: 'code' },
    { name: 'notes', globs: ['notes/**'], role: 'data' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ];
  const mapped = mapRepository({ repoPath: root, boundaries });
  const door = (file) => mapped.doors.find((entry) => entry.file === file);

  it('reads a cargo build whose output a later job uploads as the binary built, not checked', () => {
    const release = door('.github/workflows/release.yml');
    const main = release.runs.filter((run) => run.path === 'src/main.rs');
    assert.ok(main.length > 0 && main.every((run) => run.runKind === 'executes' && run.built === true), JSON.stringify(release.runs));
    assert.ok(release.runs.filter((run) => run.path === 'src/lib.rs').every((run) => run.runKind === 'checks' && !run.built), JSON.stringify(release.runs));
  });

  it('names what it ships per target and by the package it uploads, on every run it uploads on', () => {
    const release = door('.github/workflows/release.yml');
    assert.deepEqual(release.sends.assets, ['binary:linux-x64', 'binary:win-x64', 'msix']);
    assert.equal(release.sends.releases, false);
    assert.ok(!(release.gated ?? []).some((entry) => entry.sends.some((key) => key.startsWith('assets:') || key === 'releases')), JSON.stringify(release.gated));
  });

  it('credits the release with none of what the binary it builds writes when it runs', () => {
    assert.ok(!door('.github/workflows/release.yml').landings.includes('notes/last-run.txt'), JSON.stringify(door('.github/workflows/release.yml').landings));
  });

  it('reads a Tauri build uploaded to the release that started the run as its installers, and creates no release', () => {
    const desktop = door('.github/workflows/desktop.yml');
    assert.deepEqual(desktop.sends.assets, ['msi', 'nsis']);
    assert.equal(desktop.sends.releases, false);
    assert.ok(desktop.runs.some((run) => run.path === 'apps/desktop/src-tauri/src/main.rs' && run.built), JSON.stringify(desktop.runs));
  });

  it('names what an upload of no build here hands over', () => {
    const notes = door('.github/workflows/notes.yml');
    assert.deepEqual(notes.sends.assets, ['file:SHA256SUMS.txt', 'file:dist/*', 'file:sbom.json', 'files']);
    assert.equal(notes.sends.releases, false);
  });

  it('still reads a release action on a tag push as creating the release', () => {
    const tag = door('.github/workflows/tag.yml');
    assert.equal(tag.sends.releases, true);
    assert.equal(tag.sends.assets, undefined);
  });
});
