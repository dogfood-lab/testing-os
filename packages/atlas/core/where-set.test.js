import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { whereSet } from './landings.js';

// Where a caller's place goes, as the page names it (fixtures/atlas/
// rust-caller-paths holds the writes these come from).

describe('where a write to a caller\'s place goes', () => {
  it('names the directory spelled under the working directory or the home directory', () => {
    assert.deepEqual(whereSet([{ anchor: 'cwd', text: 'saves/', open: true }], 'write'), ['cwd:saves/']);
    assert.deepEqual(whereSet([{ anchor: 'cwd', text: 'saves', open: false }], 'create_dir_all'), ['cwd:saves/']);
    assert.deepEqual(whereSet([{ anchor: 'home', text: '.stash/state.json', open: false }], 'write'), ['home:.stash/']);
    assert.deepEqual(whereSet([{ anchor: 'cwd', text: 'SHIP_GATE.md', open: false }], 'writeFileSync'), ['cwd:SHIP_GATE.md']);
  });

  it('names no place for a name only partly spelled, and none for a drive or a variable', () => {
    assert.deepEqual(whereSet([{ anchor: 'cwd', text: 'run-', open: true }], 'write'), ['cwd']);
    assert.deepEqual(whereSet([{ anchor: 'cwd', text: '.session.json', open: true }], 'rename'), ['cwd']);
    assert.deepEqual(whereSet([{ anchor: 'cwd', text: 'C:/x', open: false }], 'write'), ['cwd']);
    assert.deepEqual(whereSet([{ anchor: 'env', text: '', open: false }, { anchor: 'param', text: 'x', open: false }], 'write'), ['caller']);
    assert.deepEqual(whereSet([{ anchor: 'temp', text: 'x', open: false }], 'write'), ['temp']);
  });
});
