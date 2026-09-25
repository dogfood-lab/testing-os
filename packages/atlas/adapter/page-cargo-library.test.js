import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/cargo-own-library: a binary that uses its own package's
// library, whose root lists the modules (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cargo-own-library');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('where to start reading a Rust binary that uses its own library', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'engine', globs: ['crates/engine/**'], role: 'code' },
    { name: 'game', globs: ['src/**'], role: 'code' },
    { name: 'root', globs: ['*'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/cargo-own-library' }).json);
  const file = (path) => structure.boundaries.flatMap((boundary) => boundary.files).find((entry) => entry.path === path);

  it('records the library a binary uses from its own package', () => {
    assert.equal(file('src/main.rs').library, 'src/lib.rs');
    assert.equal(file('src/turn.rs').library, undefined);
  });

  it('goes from the binary into its library, and through it to the crate the binary reaches', () => {
    assert.equal(data.startDoor, 'Cargo.toml#mile-game');
    assert.deepEqual(data.startHere, ['src/main.rs', 'src/lib.rs', 'src/turn.rs', 'crates/engine/src/lib.rs']);
  });
});
