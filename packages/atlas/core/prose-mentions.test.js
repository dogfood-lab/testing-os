import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/prose-mentions: two Markdown pages that name logos/, one in
// prose and one in commands that read it, and a JSON file that quotes it.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/prose-mentions');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function reads(path) {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [] });
  return mapped.unassigned.find((file) => file.path === path).reads.map((read) => `${read.target} ${read.call}`);
}

describe('a Markdown page that names a place', () => {
  it('reads nothing it names in prose', () => {
    assert.deepEqual(reads('docs/prose.md'), []);
  });

  it('reads what a command in a code span or a fence reads', () => {
    assert.deepEqual(reads('docs/commands.md'), ['logos --logos', 'logos/a.svg cp', 'logos/index.json cat']);
  });

  it('leaves what a JSON file quotes as evidence', () => {
    assert.deepEqual(reads('settings.json'), ['logos literal']);
  });
});
