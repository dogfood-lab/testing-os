import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/rust-imports: a binary's modules, the crates it uses and a
// file it includes (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/rust-imports');
const BOUNDARIES = [
  { name: 'core', globs: ['crates/core/**'], role: 'code' },
  { name: 'game', globs: ['crates/game/**'], role: 'code' },
  { name: 'root', globs: ['*'], role: 'config' },
];
const roots = [];
let mapped;
let files;

function sites(path) {
  return Object.fromEntries(files.get(path).imports.map((site) => [site.specifier, site.resolved]));
}

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
  files = new Map(mapped.boundaries.flatMap((boundary) => boundary.files).map((file) => [file.path, file]));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('Rust imports resolve through the module tree', () => {
  it('loads a module from name/mod.rs, from name.rs, and from where #[path] says', () => {
    const main = sites('crates/game/src/main.rs');
    assert.deepEqual(main['mod combat'], { outcome: 'file', path: 'crates/game/src/combat/mod.rs' });
    assert.deepEqual(main['mod ui'], { outcome: 'file', path: 'crates/game/src/ui.rs' });
    assert.deepEqual(main['mod platform'], { outcome: 'file', path: 'crates/game/src/platform/unix.rs' });
  });

  it('loads a mod.rs module\'s children beside it, and a name.rs module\'s under the directory named for it', () => {
    assert.deepEqual(sites('crates/game/src/combat/mod.rs')['mod dice'], { outcome: 'file', path: 'crates/game/src/combat/dice.rs' });
    assert.deepEqual(sites('crates/game/src/ui.rs')['mod widgets'], { outcome: 'file', path: 'crates/game/src/ui/widgets.rs' });
  });

  it('resolves a use to the deepest module it names, through super, the crate root and another crate\'s library', () => {
    assert.deepEqual(sites('crates/game/src/ui/widgets.rs')['super::super::combat'], { outcome: 'file', path: 'crates/game/src/combat/mod.rs' });
    assert.deepEqual(sites('crates/core/src/rules.rs')['crate::engine::Engine'], { outcome: 'file', path: 'crates/core/src/engine.rs' });
    const main = sites('crates/game/src/main.rs');
    assert.deepEqual(main['mile_core::engine'], { outcome: 'file', path: 'crates/core/src/engine.rs' });
    assert.deepEqual(main['mile_core::engine::Engine'], { outcome: 'file', path: 'crates/core/src/engine.rs' });
    assert.deepEqual(main['mile_game::prelude::*'], { outcome: 'file', path: 'crates/game/src/prelude.rs' });
    assert.deepEqual(sites('crates/game/tests/play.rs')['mile_game::prelude::hello'], { outcome: 'file', path: 'crates/game/src/prelude.rs' });
  });

  it('resolves a module inside a file to that file', () => {
    assert.deepEqual(sites('crates/core/src/lib.rs')['inner::deep'], { outcome: 'file', path: 'crates/core/src/lib.rs' });
  });

  it('counts a declared dependency and the standard library as external, and a crate no manifest declares as unresolved', () => {
    const main = sites('crates/game/src/main.rs');
    assert.deepEqual(main['serde::Deserialize'], { outcome: 'external' });
    assert.deepEqual(main['std::fs'], { outcome: 'external' });
    assert.deepEqual(main['rand::Rng'], { outcome: 'unresolved', reason: 'undeclared-crate' });
    const game = mapped.boundaries.find((boundary) => boundary.name === 'game');
    assert.equal(game.unresolvedSites, 1);
  });

  it('keeps a path spelled in code when it names a module here, and no other', () => {
    const main = sites('crates/game/src/main.rs');
    assert.deepEqual(main['mile_core::rules'], { outcome: 'file', path: 'crates/core/src/rules.rs' });
    assert.deepEqual(main['crate::platform'], { outcome: 'file', path: 'crates/game/src/platform/unix.rs' });
    assert.equal(main.Engine, undefined);
    assert.ok(!files.get('crates/core/src/rules.rs').imports.some((site) => site.specifier === 'Engine'));
  });

  it('draws the edge between the crates and walks the binary\'s reach into the library it uses', () => {
    assert.deepEqual(mapped.edges.filter((edge) => edge.kind === 'file'), [{ from: 'game', kind: 'file', to: 'core' }]);
    const game = mapped.doors.find((door) => door.name === 'mile-game');
    assert.deepEqual(game.reach.map((entry) => [entry.boundary, entry.depth]), [['game', 0], ['core', 1]]);
  });

  it('reads the file an include macro names, from the file it is written in', () => {
    assert.deepEqual(files.get('crates/game/src/main.rs').reads.map((read) => [read.target, read.call]), [['crates/game/assets/map.txt', 'include_str']]);
  });

  it('carries none of what resolution read', () => {
    const main = files.get('crates/game/src/main.rs');
    assert.equal(main.rustModule, undefined);
    assert.equal(main.rustIncludes, undefined);
    assert.ok(main.imports.every((site) => site.rust === undefined));
  });
});
