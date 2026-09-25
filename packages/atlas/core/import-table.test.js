import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';

// fixtures/atlas/import-table: a command that loads its subcommands through
// a const table of paths (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/import-table');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a dynamic import through a literal table', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = ['bin', 'lib', 'scripts'].map((name) => ({ name, globs: [`${name}/**`], role: 'code' }));
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const file = (path) => structure.boundaries.flatMap((boundary) => boundary.files).find((entry) => entry.path === path);

  it('imports every path the table holds, straight or through a const bound to the lookup', () => {
    assert.deepEqual(file('bin/tool.js').importsFiles, ['lib/report.js', 'scripts/build.js', 'scripts/init.js', 'scripts/serve.js', 'scripts/show.js']);
    const bin = structure.boundaries.find((boundary) => boundary.name === 'bin');
    assert.equal(bin.unresolvedSites, 0);
  });

  it('says a condition on a loop variable with its loop, never as a value', () => {
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/import-table' });
    assert.ok(markdown.includes('Or, for an entry of `namespaces` where `command === head`, main does report (lib) instead.'), markdown);
    assert.ok(!markdown.includes('Or, when `command === head`'), markdown);
  });
});
