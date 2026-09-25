import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unresolved-reasons: import sites that do not resolve, each
// for its own reason (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unresolved-reasons');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the imports that could not be resolved', () => {
  it('names each site with why, and reads a joined manifest as a read', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'], role: 'code' }] }), '0'.repeat(40));
    const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unresolved-reasons' }).json);
    assert.ok(data.limits.includes('3 imports could not be resolved: `app/next-env.d.ts` imports `./.next/types/routes.d.ts`, which a build generates; `src/sync.ts` loads `@x/optional` when it is installed, which is not declared; `vitest.config.ts` probes `@vitest/coverage-v8`, which is not declared.'), data.limits.join('\n'));
  });
});
