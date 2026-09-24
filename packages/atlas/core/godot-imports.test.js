import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/godot-imports: scenes that instance scripts and scenes, and
// scripts that extend, preload, load and call by global name (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/godot-imports');
const BOUNDARIES = [
  { name: 'art', globs: ['art/**', 'data/**'], role: 'data' },
  { name: 'autoload', globs: ['autoload/**'], role: 'code' },
  { name: 'root', globs: ['*'], role: 'config' },
  { name: 'scenes', globs: ['scenes/**'], role: 'code' },
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  { name: 'ui', globs: ['ui/**'], role: 'code' },
];
const roots = [];
let mapped;
let files;

function sites(path) {
  return Object.fromEntries(files.get(path).imports.map((site) => [site.specifier, [site.kind, site.resolved]]));
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

describe('what GDScript and a scene use', () => {
  it('imports the scripts and scenes a scene instances, and reads its other resources', () => {
    assert.deepEqual(sites('scenes/main.tscn'), {
      'res://scenes/hud.tscn': ['static', { outcome: 'file', path: 'scenes/hud.tscn' }],
      'res://scripts/main.gd': ['static', { outcome: 'file', path: 'scripts/main.gd' }],
    });
    assert.deepEqual(files.get('scenes/main.tscn').reads.map((read) => [read.target, read.call]), [['art/bg.png', 'ext_resource']]);
  });

  it('imports what a script extends, preloads, loads through a const and switches to, from the project\'s root', () => {
    const main = sites('scripts/main.gd');
    assert.deepEqual(main['res://scripts/base_actor.gd'], ['static', { outcome: 'file', path: 'scripts/base_actor.gd' }]);
    assert.deepEqual(main['res://scripts/stats.gd'], ['static', { outcome: 'file', path: 'scripts/stats.gd' }]);
    assert.deepEqual(main['res://scenes/world.tscn'], ['dynamic-literal', { outcome: 'file', path: 'scenes/world.tscn' }]);
    assert.deepEqual(main['res://scenes/end.tscn'], ['dynamic-literal', { outcome: 'file', path: 'scenes/end.tscn' }]);
  });

  it('imports the file an autoload or a global class is, by the name the code uses, and no engine class', () => {
    const main = sites('scripts/main.gd');
    assert.deepEqual(main['global:EventBus'], ['static', { outcome: 'file', path: 'autoload/event_bus.gd' }]);
    assert.deepEqual(main['global:Score'], ['static', { outcome: 'file', path: 'scripts/score.gd' }]);
    assert.ok(!Object.keys(main).some((specifier) => /Node2D|RefCounted/.test(specifier)), Object.keys(main).join(' '));
    assert.deepEqual(sites('scripts/player.gd')['global:Score'], ['static', { outcome: 'file', path: 'scripts/score.gd' }]);
  });

  it('reads a resource of data it loads, and counts one whose path is built at run time', () => {
    const main = files.get('scripts/main.gd');
    assert.deepEqual(main.reads.map((read) => [read.target, read.call]), [['data/items.tres', 'load']]);
    assert.equal(main.dynamicReads, 1);
    assert.equal(main.godot, undefined);
  });

  it('reads the order of work from the script the main scene instances, from the callback the engine calls', () => {
    const main = files.get('scripts/main.gd');
    assert.equal(main.entry, '_ready');
    const calls = main.sequences.find((sequence) => sequence.name === '_ready').calls.map((call) => [call.name, call.target?.file ?? null, call.receiver ?? null]);
    assert.deepEqual(calls, [['new', 'scripts/stats.gd', 'Stats'], ['announce', 'autoload/event_bus.gd', null], ['add', 'scripts/score.gd', null]]);
    const { markdown } = buildPage({ structure: buildArtifact(mapped, '0'.repeat(40)), statistics: {}, document: {}, repoName: 'fixture/godot-imports' });
    assert.match(markdown, /Inside scripts\/main\.gd, ready does, in order: new \(Stats\), announce \(autoload\) and add\./);
    assert.match(markdown, /\nThe game writes nothing this map can see\./);
  });

  it('walks the game\'s reach from the main scene through what it instances and what those scripts use', () => {
    const game = mapped.doors.find((door) => door.app === 'game');
    assert.deepEqual(game.reach.map((entry) => [entry.boundary, entry.depth]), [['scenes', 0], ['scripts', 1], ['autoload', 2], ['ui', 2]]);
    const unresolved = mapped.boundaries.reduce((sum, boundary) => sum + boundary.unresolvedSites, 0);
    assert.equal(unresolved, 0);
  });
});
