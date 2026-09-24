import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/cargo-manifests: two commands and a Tauri desktop app a
// Cargo workspace installs (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cargo-manifests');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'cli', globs: ['crates/cli/**'], role: 'code' },
    { name: 'desktop', globs: ['apps/desktop/**'], role: 'code' },
    { name: 'engine', globs: ['crates/engine/**'], role: 'code' },
    { name: 'root', globs: ['*'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/cargo-manifests' });
  return { structure, markdown: page.markdown, data: JSON.parse(page.json) };
}

describe('what a Cargo workspace installs, on the page', () => {
  const { structure, markdown, data } = mapped();

  it('carries the desktop app on its door in the artifact', () => {
    const desktop = structure.doors.find((door) => door.name === 'forge-desktop');
    assert.equal(desktop.kind, 'command');
    assert.equal(desktop.app, 'desktop');
  });

  it('says each binary is a command people run, and the Tauri binary the desktop app people install', () => {
    assert.match(markdown, /\*\*forge\*\* \(a command people run\)\. Runs crates\/cli\/src\/main\.rs\./);
    assert.match(markdown, /\*\*doctor\*\* \(a command people run\)\. Runs crates\/cli\/src\/bin\/doctor\.rs\./);
    assert.match(markdown, /\*\*forge-desktop\*\* \(the desktop app people install\)\. Runs apps\/desktop\/src-tauri\/src\/main\.rs\./);
    const desktop = data.doors.find((door) => door.name === 'forge-desktop');
    assert.equal(desktop.app, 'desktop');
  });

  it('names the commands and the desktop app apart on the first line', () => {
    assert.match(data.derived, / People run doctor and forge\. People install the forge-desktop desktop app\.$/);
  });

  it('no longer says the map reads no Rust', () => {
    assert.ok(!data.limits.some((line) => /Rust/.test(line)), data.limits.join('\n'));
  });
});
