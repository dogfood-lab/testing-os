import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// The error-handling constructs a file holds, which the test-gap rule G6
// names when no test imports or runs the file, and which rank a gap: error
// handling is the least-tested code (docs/atlas-test-gaps.spec.md).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/failure-paths');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function filesOf() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'], role: 'code' }] }), '0'.repeat(40));
  return new Map(structure.boundaries[0].files.map((file) => [file.path, file]));
}

describe('failure paths', () => {
  const files = filesOf();

  it('reads a catch and a throw in JavaScript, with the function each sits in', () => {
    assert.deepEqual(files.get('src/load.js').failurePaths, [
      { kind: 'catch', line: 6, in: 'loadConfig' },
      { kind: 'throw', line: 7, in: 'loadConfig' },
    ]);
  });

  it('reads an except and a raise in Python', () => {
    assert.deepEqual(files.get('app/io.py').failurePaths, [
      { kind: 'except', line: 5, in: 'read_rows' },
      { kind: 'raise', line: 6, in: 'read_rows' },
    ]);
  });

  it('reads an Err a Rust function matches and one it builds', () => {
    assert.deepEqual(files.get('crate/src/lib.rs').failurePaths, [
      { kind: 'match-err', line: 4, in: 'parse' },
      { kind: 'err', line: 4, in: 'parse' },
    ]);
  });

  it('counts none in a test file', () => {
    assert.equal(files.get('test/load.test.js').failurePaths, undefined);
  });
});
