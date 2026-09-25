import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/expanded-dirs: manifests no workspace names, which CI
// tests in and a dispatch publishes (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/expanded-dirs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the commands of a manifest no workspace names', () => {
  it('are doors when a workflow publishes it or works in its directory, and a private one ships nothing', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [
      { name: 'packages', globs: ['packages/**'], role: 'code' },
      { name: 'examples', globs: ['examples/**'], role: 'code' },
      { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    ];
    const mapped = mapRepository({ repoPath: root, boundaries });
    const commands = mapped.doors.filter((entry) => entry.kind === 'command')
      .map((entry) => [entry.name, entry.file, entry.runs.map((run) => run.path), entry.privatePackage === true]);
    assert.deepEqual(commands, [
      ['one', 'examples/one/package.json', ['examples/one/bin/one.js'], false],
      ['two', 'examples/two/package.json', ['examples/two/bin/two.js'], false],
      ['alpha', 'packages/alpha/package.json', ['packages/alpha/bin/alpha.js'], false],
      ['beta', 'packages/beta/package.json', ['packages/beta/bin/beta.js'], true],
    ]);
  });
});
