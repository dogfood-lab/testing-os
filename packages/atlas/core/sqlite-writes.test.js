import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/sqlite-writes: a database a script builds with
// sqlite3.connect, and a test that restores its bytes (see the fixture's
// README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/sqlite-writes');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a database file', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'kb', globs: ['kb/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }] });
  const writers = () => mapped.landings.find((landing) => landing.target === 'kb/tool.db')?.writers.map((entry) => entry.by) ?? [];

  it('is written by the script that opens it with sqlite3.connect', () => {
    assert.ok(writers().includes('kb/build_db.py'), JSON.stringify(mapped.landings));
  });

  it('is not written by a test that only puts its bytes back', () => {
    assert.ok(!writers().includes('tests/test_kb.py'), JSON.stringify(writers()));
  });
});
