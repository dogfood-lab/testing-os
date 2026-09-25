import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/container-starts: images a Dockerfile builds from files it
// copies in (see the fixture's README). What a COPY takes is packed into the
// image, never checked: no tool reads it here.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/container-starts');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what a Dockerfile copies into an image', () => {
  it('is packed into it, in what comes in, the steps and the other doors', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'camp', globs: ['camp/**', 'bin/**', 'cli/**'], role: 'code' },
      { name: 'packages', globs: ['packages/**'], role: 'code' },
      { name: 'worker', globs: ['worker/**'], role: 'code' },
      { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    ];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/container-starts' });
    assert.ok(markdown.includes('1. **CLI image.** On a pull request. Runs camp/cli.py; packs camp/ and pyproject.toml into an image.'), markdown);
    assert.ok(markdown.includes('1. The workflow runs camp/cli.py in camp; it packs camp/ in camp and pyproject.toml in root into an image.'), markdown);
    assert.ok(markdown.includes('**Publish to GHCR** runs packages/node/src/main.ts, builds packages/node/, packs package.json, packages/ and pnpm-workspace.yaml into an image, and publishes a container image.'), markdown);
    assert.ok(!/checks (camp\/|package\.json)/.test(markdown), markdown);
  });
});
