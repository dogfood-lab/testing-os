import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/commands installs a command from its root manifest, one from
// a workspace member, one from pyproject.toml, and is a published package with
// a main. Two more manifests sit in tests/fixtures, where a test copies them:
// they are material, not commands of this repository.
const COMMANDS = resolve(import.meta.dirname, '../../../fixtures/atlas/commands');
const BOUNDARIES = parse(readFileSync(join(COMMANDS, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries;

const roots = [];
let mapped;

function door(kind, name) {
  const found = mapped.doors.find((item) => item.kind === kind && item.name === name);
  assert.ok(found, `${kind} ${name}`);
  return found;
}

before(() => {
  const root = makeRepo(COMMANDS);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('commands a repository installs are doors', () => {
  it('records every command of the root manifest, a workspace member and pyproject.toml, and the published package', () => {
    const commands = mapped.doors.filter((item) => item.kind != null).map((item) => [item.kind, item.name, item.file]);
    assert.deepEqual(commands, [
      ['package', '@acme/tool', 'package.json'],
      ['command', 'tool', 'package.json'],
      ['command', 'kit', 'packages/kit/package.json'],
      ['command', 'acme-py', 'pyproject.toml'],
    ]);
  });

  it('leaves manifests in test material out', () => {
    assert.ok(!mapped.doors.some((item) => item.name === 'fixture-tool' || item.name === 'fixture-py'));
  });

  it('runs the declared file and walks its reach like any door, with no trigger, stage or send', () => {
    const tool = door('command', 'tool');
    assert.deepEqual(tool.runs.map((run) => run.path), ['bin/tool.mjs']);
    assert.deepEqual(tool.reach.map((entry) => [entry.boundary, entry.depth]), [['bin', 0], ['lib', 1]]);
    assert.deepEqual(tool.triggers, []);
    assert.deepEqual(tool.stages, []);
    assert.deepEqual(tool.landings, []);
    assert.equal(tool.pushes, false);
    assert.deepEqual(tool.sends, {
      deploysPages: false,
      dispatchesTo: [],
      opensIssues: false,
      opensIssuesOnFailure: false,
      opensPullRequests: false,
      publishes: false,
      publishesTo: [],
      releases: false,
    });
    assert.deepEqual(door('command', 'acme-py').runs.map((run) => run.path), ['acmepy/cli.py']);
    assert.deepEqual(door('package', '@acme/tool').runs.map((run) => run.path), ['lib/api.js']);
  });

  it('makes the declared file an entry point of the part that holds it, though that part has no manifest', () => {
    const bin = mapped.boundaries.find((boundary) => boundary.name === 'bin');
    assert.deepEqual(bin.entryPoints, ['bin/tool.mjs']);
  });
});
