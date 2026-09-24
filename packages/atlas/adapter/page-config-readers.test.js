import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/config-readers: icons and logos a desktop app's
// configuration names, and a PowerShell script that copies them (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/config-readers');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'app', globs: ['app/**'], role: 'code' },
    { name: 'data', globs: ['data/**'], role: 'data' },
    { name: 'msix', globs: ['msix/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/config-readers' });
  return { structure, markdown: page.markdown };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

function readers(structure, target) {
  return (structure.landings.find((landing) => landing.target === target)?.readers ?? []).map((entry) => `${entry.by} ${entry.call}`).sort();
}

describe('a file configuration names', () => {
  const { structure, markdown } = mapped();

  it('is read by the configuration, relative to it and with backslashes', () => {
    assert.deepEqual(readers(structure, 'app/icons/32x32.png'), ['app/tauri.conf.json configuration']);
    assert.deepEqual(readers(structure, 'app/icons/icon.ico'), ['app/tauri.conf.json configuration']);
    assert.ok(readers(structure, 'msix/Assets/StoreLogo.png').includes('msix/AppxManifest.xml configuration'));
    assert.ok(readers(structure, 'msix/Assets/Square44x44Logo.png').includes('msix/AppxManifest.xml configuration'));
  });

  it('is read and written by a PowerShell Copy-Item, through Join-Path from $PSScriptRoot', () => {
    assert.ok(readers(structure, 'msix/AppxManifest.xml').includes('msix/build-msix.ps1 Copy-Item'));
    assert.ok(readers(structure, 'msix/Assets').includes('msix/build-msix.ps1 Copy-Item'));
    const writers = (target) => (structure.landings.find((landing) => landing.target === target)?.writers ?? []).map((entry) => entry.by);
    assert.deepEqual(writers('msix/layout'), ['msix/build-msix.ps1']);
    assert.deepEqual(writers('msix/layout/Assets'), ['msix/build-msix.ps1']);
  });

  it('names the configuration as a reader of what CI writes, and a file that only quotes a path as found by text', () => {
    const reads = section(markdown, 'Who reads the results');
    assert.ok(reads.includes('- **app/icons/** is read by app/tauri.conf.json (from configuration).'), reads);
    assert.ok(reads.includes('- **msix/Assets/** is read by data/notes.json (found by text), msix/AppxManifest.xml (from configuration) and msix/build-msix.ps1 (found by text).'), reads);
    assert.doesNotMatch(section(markdown, 'Written but never read'), /icons|Assets/);
  });
});
