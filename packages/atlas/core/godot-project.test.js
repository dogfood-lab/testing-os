import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact, serializeArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { manifestDirs } from '../adapter/propose.js';
import { godotProjects } from './godot.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/godot-project: a main scene, two autoloads and two export
// presets (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/godot-project');
const BOUNDARIES = [
  { name: 'autoload', globs: ['autoload/**'], role: 'code' },
  { name: 'root', globs: ['*'], role: 'config' },
  { name: 'scenes', globs: ['scenes/**'], role: 'code' },
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
];
const roots = [];
let root;
let mapped;

before(() => {
  root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a Godot project is read as the engine reads it', () => {
  it('reads the main scene, the autoloads and the export presets', () => {
    const [project] = godotProjects(root, new Set(mapped.boundaries.flatMap((boundary) => boundary.files).map((file) => file.path)));
    assert.equal(project.name, 'Harbour');
    assert.equal(project.mainScene, 'scenes/main.tscn');
    assert.deepEqual(project.autoloads, [{ name: 'EventBus', path: 'autoload/event_bus.gd' }, { name: 'Save', path: 'autoload/save.gd' }]);
    assert.deepEqual(project.presets, [{ name: 'Linux', platform: 'Linux' }, { name: 'Windows Desktop', platform: 'Windows Desktop' }]);
  });

  it('makes the main scene the door of the game, which starts it', () => {
    const game = mapped.doors.find((door) => door.app === 'game');
    assert.ok(game, JSON.stringify(mapped.doors.map((door) => door.name)));
    assert.equal(game.kind, 'command');
    assert.equal(game.name, 'the game');
    assert.equal(game.file, 'project.godot');
    assert.deepEqual(game.runs.map((run) => run.path), ['scenes/main.tscn']);
  });

  it('makes each autoload an entry point of the part that holds it', () => {
    const autoload = mapped.boundaries.find((boundary) => boundary.name === 'autoload');
    assert.deepEqual(autoload.entryPoints, ['autoload/event_bus.gd', 'autoload/save.gd']);
  });

  it('says the game starts its main scene, on the page', () => {
    const structure = buildArtifact(mapped, '0'.repeat(40));
    const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/godot-project' });
    assert.match(page.markdown, /\*\*the game\*\* \(what Godot runs\)\. Starts scenes\/main\.tscn\./);
    assert.match(JSON.parse(page.json).derived, / People run the game\.$/);
  });

  it('proposes a project in a directory of its own as a part', () => {
    assert.deepEqual(manifestDirs(root, ['game/project.godot', 'game/main.gd', 'README.md']), ['game']);
  });

  it('writes the same structure whether or not the engine left .godot/ behind', () => {
    const first = serializeArtifact(buildArtifact(mapped, '0'.repeat(40)));
    for (const [path, text] of [
      ['.godot/global_script_class_cache.cfg', 'list=[{"class": &"Player", "path": "res://scripts/player.gd"}]\n'],
      ['.godot/imported/icon.png-1.ctex', 'binary'],
      ['.godot/editor/main.tscn-folding.cfg', '[folding]\n'],
      ['.godot/uid_cache.bin', 'x'],
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const again = serializeArtifact(buildArtifact(mapRepository({ repoPath: root, boundaries: BOUNDARIES }), '0'.repeat(40)));
    assert.equal(again, first);
  });
});
