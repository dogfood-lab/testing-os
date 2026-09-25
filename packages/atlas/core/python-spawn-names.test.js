import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/python-spawn-names: a command line bound to a name before
// the file's own runner starts it (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/python-spawn-names');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a command line held in a name', () => {
  it('is the list the name holds, so CI runs what pytest finds', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'pkg', globs: ['pkg/**'], role: 'code' },
      { name: 'tests', globs: ['tests/**'], role: 'test' },
      { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    ];
    const ci = mapRepository({ repoPath: root, boundaries }).doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.ok(ci.runs.some((run) => run.path === 'tests/' && run.via === 'verify.py → pytest'), JSON.stringify(ci.runs));
  });
});
