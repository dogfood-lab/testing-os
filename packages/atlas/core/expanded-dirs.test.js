import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/expanded-dirs: working directories spelled with a matrix
// value and with a dispatch input (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/expanded-dirs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a working directory spelled with an expression', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'packages', globs: ['packages/**'], role: 'code' },
    { name: 'examples', globs: ['examples/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ];
  const mapped = mapRepository({ repoPath: root, boundaries });
  const door = (file) => mapped.doors.find((entry) => entry.file === file);

  it('is each value of the matrix axis it names', () => {
    assert.deepEqual(door('.github/workflows/ci.yml').runs.map((run) => run.path), ['packages/alpha/check.js', 'packages/beta/check.js']);
  });

  it('is each directory a dispatch input can name, and publishes each package there by name', () => {
    const packages = [...door('.github/workflows/publish.yml').sends.packages].map((entry) => [entry.name, entry.dir]);
    assert.deepEqual(packages, [['@f/one', 'examples/one'], ['@f/two', 'examples/two']]);
  });
});
