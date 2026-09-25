import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/package-dir-scripts: a command in a package that installs
// from a directory of another name (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/package-dir-scripts');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a script of a package-dir mapping', () => {
  it('runs the module from the directory the package installs from', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'tools', globs: ['tools/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'config' }] });
    const commands = mapped.doors.filter((door) => door.kind === 'command').map((door) => [door.name, door.runs.map((run) => run.path)]);
    assert.deepEqual(commands, [['fxdub-receipt', ['tools/receipt.py']]]);
  });
});
