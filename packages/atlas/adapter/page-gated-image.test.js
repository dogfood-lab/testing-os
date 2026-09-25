import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/gated-image: an image built only on a release event (see
// the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/gated-image');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what a gated image build copies', () => {
  it('is packed on its event, and counted as no check', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'app', globs: ['app/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/gated-image' });
    assert.ok(markdown.includes('1. **Publish.** When a release is published; or by hand. Runs app/cli.py. On a release event, it also packs README.md, app/ and pyproject.toml into an image.'), markdown);
    assert.ok(!/checks [^.]*and \d+ more/.test(markdown), markdown);
  });
});
