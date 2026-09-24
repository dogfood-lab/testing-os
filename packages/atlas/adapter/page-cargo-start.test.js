import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { parse } from 'yaml';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/cargo-start: a command whose CI runs only cargo test (see
// the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cargo-start');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('where to start reading a Rust command whose CI only tests it', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'src', globs: ['src/**'], role: 'code' },
    { name: 'tests', globs: ['tests/**'], role: 'test' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/cargo-start' }).json);

  it('reads a file cargo test runs for its own unit tests as a test, so the path follows the command', () => {
    assert.equal(data.startDoor, 'Cargo.toml#mile');
    assert.deepEqual(data.startHere, ['src/main.rs', 'src/lib.rs']);
    assert.equal(data.startReason, 'This path follows mile (a command people run) from its entry, since CI runs only tests.');
  });
});

// fixtures/atlas/tauri-ci-start: CI runs a bundling script by name, builds
// the web half with vite, checks the Tauri crate and runs the unit tests its
// library and one command module hold (see the fixture's README and its
// boundary file, which keeps the crate a part of its own).
describe('where to start reading a CI that checks a Tauri crate and runs its unit tests', () => {
  const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/tauri-ci-start');
  const start = (root, boundaries) => {
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    return JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/tauri-ci-start' }).json);
  };

  it('passes over the library and the module cargo test runs for their unit tests', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const data = start(root, parse(readFileSync(join(FIXTURE, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries);
    assert.equal(data.startDoor, '.github/workflows/ci.yml');
    assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'app/scripts/bundle.mjs']);
  });

  it('passes over a crate entry CI only checks, in the part the web half is built from', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    // The library without its own tests, which cargo check then only compiles.
    writeFileSync(join(root, 'app/src-tauri/src/lib.rs'), 'mod commands;\n\npub fn run() {\n    commands::greet();\n}\n');
    const data = start(root, [
      { name: 'app', globs: ['app/**'], role: 'code' },
      { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    ]);
    assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'app/scripts/bundle.mjs']);
  });
});
