import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileKind, roleFor } from './templates.js';

// A Godot scene instances the scripts that run the game, so a part of scenes
// is code; a resource is data a scene or a script loads; project.godot and
// the .import files the editor writes beside each asset are configuration.
describe('the roles of a Godot project\'s files', () => {
  it('reads a scene as code, a resource as data, and the project and import files as configuration', () => {
    assert.equal(fileKind('entities/enemy/enemy.tscn'), 'code');
    assert.equal(fileKind('stage/level.scn'), 'code');
    assert.equal(fileKind('project.godot'), 'config');
    assert.equal(fileKind('assets/hero.png.import'), 'config');
    assert.equal(fileKind('export_presets.cfg'), 'config');
  });

  it('makes a part of scenes code and a part of resources data', () => {
    assert.equal(roleFor(['entities/enemy/enemy.tscn', 'entities/merchant/merchant.tscn', 'entities/npc/npc.tscn']), 'code');
    assert.equal(roleFor(['data/items.tres', 'data/loot.tres', 'data/README.md']), 'data');
  });
});
