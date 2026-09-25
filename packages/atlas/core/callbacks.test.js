import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/callbacks: a server entry that returns early for --version
// and registers its handlers as callbacks (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/callbacks');
const roots = [];
let structure;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'src', globs: ['src/**'], role: 'code' }] }), '0'.repeat(40));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function main() {
  const file = structure.boundaries[0].files.find((entry) => entry.path === 'src/index.js');
  return file.sequences.find((sequence) => sequence.name === file.entry);
}

describe('the order of work in an entry', () => {
  it('leaves out what a callback handed to a registration does', () => {
    assert.deepEqual(main().calls.map((call) => call.name), ['printVersion', 'loadConfig', 'createServer']);
  });

  it('keeps a branch that returns early apart, as the other way the function goes', () => {
    assert.deepEqual(main().calls.map((call) => call.branch ?? null), ["process.argv.includes('--version')", null, null]);
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/callbacks' });
    assert.ok(markdown.includes('1. Inside src/index.js, `main` does, in order: `loadConfig` and `createServer`.'), markdown);
    assert.ok(markdown.includes("2. Or, when `process.argv.includes('--version')`, `main` does `printVersion` instead."), markdown);
  });
});
