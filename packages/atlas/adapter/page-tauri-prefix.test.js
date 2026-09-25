import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/tauri-prefix: a release that builds the desktop app through
// npm --prefix app run tauri build -- <args> and uploads its bundles (see
// the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/tauri-prefix');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a desktop app built through an npm script with arguments', () => {
  it('is shipped by the release that builds and uploads it', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'app', globs: ['app/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/tauri-prefix' });
    assert.ok(markdown.includes('People install the shell desktop app.'), markdown);
    assert.ok(markdown.includes('2. It builds app/src-tauri/src/main.rs into binaries for Linux and Windows and uploads them to the release.'), markdown);
  });
});
