import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/rust-macro-calls: calls inside println!, assert! and vec!
// (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/rust-macro-calls');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the order of work through a Rust macro\'s arguments', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [
    { name: 'root', globs: ['*'], role: 'config' },
    { name: 'src', globs: ['src/**'], role: 'code' },
  ] });
  const main = mapped.boundaries.find((boundary) => boundary.name === 'src').files.find((file) => file.path === 'src/main.rs');

  it('reads a call by path in a macro\'s tokens as a step, in order, and a method on a value as none', () => {
    const entry = main.sequences.find((sequence) => sequence.name === 'main');
    assert.deepEqual(entry.calls.map((call) => [call.name, call.target?.file ?? null]), [
      ['load', 'src/config.rs'],
      ['run', 'src/engine.rs'],
      ['draw', 'src/render.rs'],
    ]);
  });
});
