import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/own-steps: an entry that calls string methods and a test
// helper beside its own functions (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/own-steps');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the order of work', () => {
  it('names the project\'s own functions as the code spells them, never builtins or test helpers', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const boundaries = [{ name: 'root', globs: ['*', '.github/**'], role: 'code' }, { name: 'tests', globs: ['tests/**'], role: 'test' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/own-steps' });
    assert.ok(markdown.includes('Inside tool.py, `main` does, in order: `load_text` and `write_report`.'), markdown);
    assert.ok(!/splitlines|lstrip|fake_clock/.test(markdown.split('## What happens')[1].split('## Who reads')[0]), markdown);
  });
});
