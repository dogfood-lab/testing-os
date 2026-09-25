import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/cargo-widest-test: a workspace CI only tests, with a unit
// test in hull and an integration test in testkit (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cargo-widest-test');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('where to start reading a workspace whose CI only tests it and that installs nothing', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = ['export', 'hull', 'schema', 'testkit'].map((name) => ({ name, globs: [`crates/${name}/**`], role: 'code' }))
    .concat([{ name: 'root', globs: ['*', '.github/**'], role: 'config' }]);
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/cargo-widest-test' }).json);

  it('starts at the test that reaches the most parts, and goes on into the code it tests', () => {
    assert.deepEqual(data.startHere.slice(0, 2), ['.github/workflows/ci.yml', 'crates/testkit/tests/family.rs']);
    assert.ok(!data.startHere.includes('crates/hull/src/caps.rs'), data.startHere.join(' → '));
    assert.ok(!data.startHere.includes('crates/testkit/src/lib.rs'), data.startHere.join(' → '));
    assert.ok(data.startHere.length > 2, data.startHere.join(' → '));
  });

  it('says why it starts there', () => {
    assert.equal(data.startReason, 'This path starts at crates/testkit/tests/family.rs, the test CI runs that reaches the most parts, since CI runs only tests.');
  });
});
