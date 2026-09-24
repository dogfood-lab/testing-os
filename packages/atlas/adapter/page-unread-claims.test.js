import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unread-claims: a JSX label with a bare & and a generator
// with a NUL inside a string, each ending in a line nothing reads, the two
// files the parser cannot read (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unread-claims');
const roots = [];
let markdown;
let json;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const structure = buildArtifact(mapRepository({
    repoPath: root,
    boundaries: [{ name: 'scripts', globs: ['scripts/**'], role: 'code' }, { name: 'src', globs: ['src/**'], role: 'code' }],
  }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unread-claims' });
  markdown = page.markdown;
  json = JSON.parse(page.json);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('files the parser cannot read', () => {
  it('names the construct that stopped it in each', () => {
    assert.ok(json.limits.includes('2 files use syntax the parser cannot read (src/panel.tsx and scripts/gen.mjs), so what they import is not known: a bare `&` in JSX text (1) and other syntax (1).'), json.limits.join('\n'));
  });

  it('qualifies every claim that nothing does something by the files it could read', () => {
    for (const sentence of [
      'CI writes nothing in the files this map could read; 2 files could not be.',
      'No part is imported by another part in the files this map could read, and no part sits on the path of two doors; 2 files could not be.',
      'No place is written by the files this map could read, so none goes unread; 2 files could not be.',
      'No two parts export a helper that looks alike in the files this map could read; 2 files could not be.',
      'Nothing in the files this map could read writes to a tracked place; 2 files could not be.',
    ]) {
      assert.ok(markdown.split('\n').includes(sentence), `${sentence}\n\n${markdown}`);
    }
    assert.equal(json.unreadFiles, 2);
  });
});
