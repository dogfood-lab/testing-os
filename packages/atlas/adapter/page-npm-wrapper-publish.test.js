import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/npm-wrapper-publish: one wrapper published from npm/.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/npm-wrapper-publish');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('one package a release publishes', () => {
  it('is named by itself, never with its directory', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'npm', globs: ['npm/**'], role: 'code' }] }), '0'.repeat(40));
    const { json } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/npm-wrapper-publish' });
    assert.match(JSON.parse(json).derived, /It publishes @w\/tool to npm\./);
  });
});
