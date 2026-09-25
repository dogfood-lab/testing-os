import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/argparse-defaults: a tool whose --output defaults to a
// literal directory the repository keeps its reports in, handed to a
// writer in another module (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/argparse-defaults');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a write whose directory is a literal argparse default', () => {
  it('lands on that directory when run from the root, through the writer it is handed to', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'tools', globs: ['tools/**'], role: 'code' },
      { name: 'src', globs: ['src/**'], role: 'code' },
      { name: 'artifacts', globs: ['artifacts/**'], role: 'data' },
      { name: 'root', globs: ['*'], role: 'config' },
    ];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/argparse-defaults' });
    assert.ok(markdown.includes('- **artifacts/** is written by src/sim/reporting.py when run from the repository root, and committed.'), markdown);
    assert.ok(markdown.includes('- 1 write goes to the directory the command is run in (artifacts/) or a path its caller passes, not to this repository.'), markdown);
  });
});
