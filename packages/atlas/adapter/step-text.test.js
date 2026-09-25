import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact, serializeArtifact } from './artifact.js';

// fixtures/atlas/step-text: a secret-scan step whose script lists the
// patterns it greps the tree for (see the fixture's README). A map that
// copied the script would hold every pattern, and the scan, run over a tree
// that commits the map, would fail on it.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/step-text');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a workflow step in the map', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'root', globs: ['*', '.github/**'], role: 'config' }];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const written = serializeArtifact(structure);
  const door = structure.doors.find((entry) => entry.file === '.github/workflows/ci.yml');

  it('never carries the script a step runs', () => {
    for (const pattern of ['PRIVATE.KEY', 'sk_live_', 'sk_test_', 'aws_secret']) {
      assert.ok(!written.includes(pattern), `structure.json holds ${pattern}`);
    }
    assert.ok(!written.includes('Scanning for hardcoded secrets'), written);
  });

  it('keeps each step by job and name, with the programs it runs', () => {
    assert.deepEqual(door.commands, [
      { job: 'lint-and-test', programs: ['cat', 'echo', 'git', 'read', 'xargs'], step: 'Secret scan' },
      { job: 'lint-and-test', programs: ['npm'], step: 'Test' },
    ]);
  });

  it('still records what the steps run', () => {
    assert.ok(door.runs.some((run) => run.path === 'src/' && run.directory), JSON.stringify(door.runs));
  });
});
