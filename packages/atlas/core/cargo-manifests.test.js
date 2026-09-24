import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact, serializeArtifact } from '../adapter/artifact.js';
import { listTracked, proposalSet } from '../adapter/propose.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/cargo-manifests: a virtual workspace with a library, a
// command crate and a Tauri app whose Rust half sits in its web package (see
// the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cargo-manifests');
const BOUNDARIES = [
  { name: 'cli', globs: ['crates/cli/**'], role: 'code' },
  { name: 'desktop', globs: ['apps/desktop/**'], role: 'code' },
  { name: 'engine', globs: ['crates/engine/**'], role: 'code' },
  { name: 'root', globs: ['*'], role: 'config' },
];
const roots = [];
let root;
let mapped;

function door(name) {
  const found = mapped.doors.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

before(() => {
  root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a Cargo manifest is read as Cargo reads it', () => {
  it('makes every binary a command door, the declared one and the one found under src/bin/', () => {
    const commands = mapped.doors.filter((item) => item.kind === 'command').map((item) => [item.name, item.file, item.runs.map((run) => run.path)]);
    assert.deepEqual(commands, [
      ['forge-desktop', 'apps/desktop/src-tauri/Cargo.toml', ['apps/desktop/src-tauri/src/main.rs']],
      ['doctor', 'crates/cli/Cargo.toml', ['crates/cli/src/bin/doctor.rs']],
      ['forge', 'crates/cli/Cargo.toml', ['crates/cli/src/main.rs']],
    ]);
  });

  it('makes the binary of a Tauri app the desktop app, and no other', () => {
    assert.equal(door('forge-desktop').app, 'desktop');
    assert.equal(door('forge').app, undefined);
    assert.equal(door('doctor').app, undefined);
  });

  it('makes a library and each binary the entry points of the part that holds them', () => {
    const entries = Object.fromEntries(mapped.boundaries.map((boundary) => [boundary.name, boundary.entryPoints]));
    assert.deepEqual(entries.engine, ['crates/engine/src/lib.rs']);
    assert.deepEqual(entries.cli, ['crates/cli/src/bin/doctor.rs', 'crates/cli/src/main.rs']);
    assert.deepEqual(entries.desktop, ['apps/desktop/src-tauri/src/lib.rs', 'apps/desktop/src-tauri/src/main.rs']);
  });

  it('says nothing is unseen once the map reads the Rust', () => {
    assert.equal(mapped.unseen, undefined);
  });

  it('proposes a part per crate, and keeps a Tauri app\'s Rust half in the web package it is built with', () => {
    const { proposals } = proposalSet(root, listTracked(root));
    assert.deepEqual(proposals.map((proposal) => [proposal.name, proposal.glob]), [
      ['cli', 'crates/cli/**'],
      ['desktop', 'apps/desktop/**'],
      ['engine', 'crates/engine/**'],
      ['root', '*'],
    ]);
  });

  it('writes the same structure whether or not a build left target/ behind', () => {
    const first = serializeArtifact(buildArtifact(mapped, '0'.repeat(40)));
    for (const [path, text] of [
      ['target/debug/build/forge-engine-1/out/generated.rs', 'pub fn generated() {}\n'],
      ['target/package/forge-engine-0.1.0/Cargo.toml', '[package]\nname = "forge-engine"\nversion = "0.1.0"\n'],
      ['target/package/forge-engine-0.1.0/src/lib.rs', 'pub fn forge() {}\n'],
      ['apps/desktop/src-tauri/target/release/forge-desktop.d', 'forge-desktop: src/main.rs\n'],
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const again = serializeArtifact(buildArtifact(mapRepository({ repoPath: root, boundaries: BOUNDARIES }), '0'.repeat(40)));
    assert.equal(again, first);
  });
});
