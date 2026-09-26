import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runnerFor } from './test-sources.js';

// Where a suggested runner comes from, in the Director's order: the house
// standard where one exists, naming its file; otherwise fleet practice,
// naming how many repositories of the kind do it; otherwise the framework's
// own documentation (docs/atlas-test-gaps.spec.md, "The source table").

describe('the source of a suggested runner', () => {
  it('cites a house standard over fleet practice', () => {
    const tauri = runnerFor('tauri-app');
    assert.equal(tauri.source.from, 'house');
    assert.equal(tauri.source.file, 'E:/AI/.claude/CLAUDE.md');
    assert.equal(tauri.runner, 'Vitest (front end) and cargo test (Rust)');
  });

  it('states the fleet counts for a kind with no house standard', () => {
    const python = runnerFor('python');
    assert.equal(python.source.from, 'fleet');
    assert.equal(python.source.text, 'pytest in 17 of 18 Python repositories on the fleet page (fleet survey of 2026-09-26)');
    assert.equal(python.runner, 'pytest with pytest-cov');
  });

  it('names the external documentation for a kind the fleet has no practice for', () => {
    const extension = runnerFor('vscode-extension');
    assert.equal(extension.source.from, 'external');
    assert.match(extension.source.text, /@vscode\/test-cli/);
  });

  it('cites testing-os\'s own rule for testing-os alone', () => {
    assert.equal(runnerFor('node', { repository: 'dogfood-lab/testing-os' }).source.from, 'house');
    assert.equal(runnerFor('node', { repository: 'dogfood-lab/testing-os' }).source.file, 'CLAUDE.md');
    assert.equal(runnerFor('node', { repository: 'mcp-tool-shop-org/roll' }).source.from, 'fleet');
  });

  it('suggests no runner for a static site', () => {
    assert.equal(runnerFor('site'), null);
  });
});
