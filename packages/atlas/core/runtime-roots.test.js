import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/runtime-roots: writes whose root is decided at run time, the
// shapes taste-engine, rig-bridge, claude-rpg, runforge-vscode and
// ollama-intern-mcp use (see the fixture's README), reached from CI.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/runtime-roots');
const BOUNDARIES = [
  { name: 'bin', globs: ['bin/**'], role: 'code' },
  { name: 'canon', globs: ['canon/**'], role: 'data' },
  { name: 'records', globs: ['records/**'], role: 'data' },
  { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  { name: 'src', globs: ['src/**'], role: 'code' },
];
const roots = [];
let mapped;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function counts() {
  const out = {};
  for (const boundary of mapped.boundaries) {
    for (const file of boundary.files) {
      if ((file.outsideWrites ?? 0) + (file.dynamicWrites ?? 0) > 0) out[file.path] = [file.outsideWrites ?? 0, file.dynamicWrites ?? 0];
    }
  }
  return out;
}

describe('a write whose root is decided at run time', () => {
  it('is counted outside when the root is a parameter, a function handed the caller\'s place, a class field or env ?? home', () => {
    assert.deepEqual(counts(), {
      'src/artifacts.js': [1, 0],
      'src/backup.js': [3, 0],
      'src/logger.ts': [1, 0],
      'src/new.js': [1, 0],
      'src/session.js': [1, 0],
    });
  });

  it('never lands on a placeholder directory, and still lands where a parameter joins a real place', () => {
    assert.deepEqual(mapped.landings.filter((landing) => landing.writers.length > 0).map((landing) => [landing.target, landing.writers.map((entry) => entry.by)]), [
      ['records', ['src/records.js']],
    ]);
  });

  it('keeps canon/ out of Generated and out of what CI writes', () => {
    const structure = buildArtifact(mapped, '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/runtime-roots' });
    const generated = markdown.slice(markdown.indexOf('## Generated'), markdown.indexOf('## Hand-authored'));
    assert.doesNotMatch(generated, /canon/);
    assert.doesNotMatch(markdown, /writes to canon/);
    assert.doesNotMatch(markdown, /may land here/);
    assert.match(markdown, /- 7 writes go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository\./);
  });
});
