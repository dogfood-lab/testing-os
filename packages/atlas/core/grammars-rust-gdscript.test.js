import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { isCodePath, languageOf } from './languages.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/grammars-rust-gdscript: a crate and a Godot project, one file
// of each that does not parse (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/grammars-rust-gdscript');
const roots = [];
let files;
let derived;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'crate', globs: ['src/**', 'Cargo.toml'], role: 'code' },
    { name: 'game', globs: ['scripts/**', 'scenes/**', 'project.godot'], role: 'code' },
  ];
  const mapped = mapRepository({ repoPath: root, boundaries });
  files = new Map(mapped.boundaries.flatMap((boundary) => boundary.files).map((file) => [file.path, file]));
  const structure = buildArtifact(mapped, '0'.repeat(40));
  derived = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/grammars' }).json).derived;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('Rust and GDScript are parsed with the vendored grammars', () => {
  it('names .rs Rust and .gd GDScript, and counts both as code', () => {
    assert.equal(languageOf('src/main.rs'), 'rust');
    assert.equal(languageOf('scripts/player.gd'), 'gdscript');
    assert.ok(isCodePath('src/main.rs') && isCodePath('scripts/player.gd'));
  });

  it('parses the files that are well formed and marks the ones that are not', () => {
    for (const path of ['src/main.rs', 'src/util.rs']) {
      assert.equal(files.get(path).language, 'rust', path);
      assert.equal(files.get(path).parseError, undefined, path);
      assert.ok(Array.isArray(files.get(path).imports), path);
    }
    for (const path of ['scripts/player.gd', 'scripts/score.gd']) {
      assert.equal(files.get(path).language, 'gdscript', path);
      assert.equal(files.get(path).parseError, undefined, path);
    }
    assert.equal(files.get('src/broken.rs').parseError, true);
    assert.equal(files.get('scripts/broken.gd').parseError, true);
  });

  it('reads a scene and the project file as text, not as code', () => {
    assert.equal(files.get('scenes/main.tscn').language, null);
    assert.equal(files.get('project.godot').language, null);
  });

  it('names both languages on the first line', () => {
    assert.match(derived, /^2 parts, in GDScript \(3 files\) and Rust \(3 files\)\./);
  });
});
