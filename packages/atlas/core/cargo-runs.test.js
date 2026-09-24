import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/cargo-runs: a root package that is also the workspace, a
// member crate, three workflows and a verify script (see the fixture's
// README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cargo-runs');
const BOUNDARIES = [
  { name: 'core', globs: ['crates/core/**'], role: 'code' },
  { name: 'desktop', globs: ['apps/desktop/**'], role: 'code' },
  { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  { name: 'src', globs: ['src/**'], role: 'code' },
  { name: 'tests', globs: ['tests/**'], role: 'test' },
];
const roots = [];
let mapped;

function door(name) {
  const found = mapped.doors.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

function runs(found) {
  return found.runs.map((run) => [run.path, run.runKind, run.via ?? null]);
}

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what cargo runs and what it checks', () => {
  it('runs every test target and every file holding unit tests of the packages cargo test selects', () => {
    const ci = runs(door('CI'));
    // tests/ holds one code file, the test target, so the directory stands for it.
    assert.deepEqual(ci.find(([path]) => path === 'tests/'), ['tests/', 'executes', 'cargo test']);
    for (const path of ['src/lib.rs', 'crates/core/src/lib.rs']) {
      assert.ok(ci.some(([run, kind]) => run === path && kind === 'executes'), `${path}\n${JSON.stringify(ci)}`);
    }
    assert.ok(!ci.some(([run]) => run === 'crates/core/src/util.rs'), 'a module with no tests is not a test target');
  });

  it('only checks what check, clippy, fmt and build compile', () => {
    // Four tools compile it; the first by name is the one recorded.
    assert.deepEqual(runs(door('CI')).find(([path]) => path === 'src/bin/report.rs'), ['src/bin/report.rs', 'checks', 'cargo build']);
  });

  it('runs the binary a script starts by the path cargo builds it to', () => {
    assert.deepEqual(runs(door('CI')).find(([path]) => path === 'src/main.rs'), ['src/main.rs', 'executes', 'verify.sh']);
  });

  it('runs the binary cargo run names, and names it as the command does', () => {
    const release = door('Release');
    assert.deepEqual(runs(release), [['src/bin/report.rs', 'executes', null]]);
    assert.deepEqual(release.sends.publishesTo, ['crates.io']);
  });

  it('checks a Tauri app tauri build compiles, and runs the web build its beforeBuildCommand names first', () => {
    assert.deepEqual(runs(door('Desktop')), [
      ['apps/desktop/build.mjs', 'executes', 'tauri build'],
      ['apps/desktop/src-tauri/src/main.rs', 'checks', 'tauri build'],
    ]);
  });

  it('walks the reach from what the tests run into the crates they use', () => {
    assert.deepEqual(door('CI').reach.map((entry) => entry.boundary).sort(), ['core', 'root', 'src', 'tests']);
  });
});
