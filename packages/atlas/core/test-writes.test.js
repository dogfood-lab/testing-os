import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/test-writes: a test rewriting committed examples through a
// helper, and a Pillow image saved into a committed directory (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/test-writes');
const roots = [];
let mapped;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({
    repoPath: root,
    boundaries: [
      { name: 'app', globs: ['packages/app/**'], role: 'code' },
      { name: 'docs', globs: ['docs/**'], role: 'docs' },
      { name: 'examples', globs: ['examples/**'], role: 'data' },
      { name: 'scripts', globs: ['scripts/**'], role: 'code' },
    ],
  });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a write into tracked files', () => {
  it('is a write by the test that makes it, and by the door that runs the test', () => {
    const written = mapped.landings.filter((landing) => landing.writers.length > 0).map((landing) => [landing.target, landing.writers.map((entry) => entry.by)]);
    assert.deepEqual(written, [
      ['docs/assets/one/banner.png', ['scripts/previews.py']],
      ['examples/assets', ['packages/app/src/materialize.test.ts']],
    ]);
    const ci = mapped.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.landings, ['docs/assets/one/banner.png', 'examples/assets']);
  });

  it('lists what a test writes as generated, by a test', () => {
    const structure = buildArtifact(mapped, '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/test-writes' });
    assert.ok(markdown.includes('- **examples/assets/** is written by packages/app/src/materialize.test.ts (a test).'), markdown);
    // docs/ holds nothing else, so the whole part is what the script writes.
    assert.ok(markdown.includes('- **docs/** is written by scripts/previews.py.'), markdown);
  });
});
