import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/start-scenes: a game whose main scene attaches two scripts
// that import nothing (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/start-scenes');
const roots = [];
let markdown;
let data;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'root', globs: ['*'], role: 'config' },
    { name: 'scenes', globs: ['scenes/**'], role: 'code' },
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/start-scenes' });
  markdown = built.markdown;
  data = JSON.parse(built.json);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function section(heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

describe('where to start in a game whose main scene attaches scripts', () => {
  it('says what the game reaches where the path ends, as what happens through it does', () => {
    assert.ok(section('What happens through the game').includes('2. That reaches scripts (2 files).'), markdown);
    const start = section('Where to start');
    assert.ok(start.includes('Start at scenes/main.tscn, which leads on to scripts/hud.gd and scripts/world.gd; this map records no order among them, so the path ends there.'), start);
    assert.ok(!start.includes('runs no code'), start);
    assert.deepEqual(data.startHere, ['scenes/main.tscn']);
    assert.deepEqual(data.startStop, { files: ['scripts/hud.gd', 'scripts/world.gd'], from: 'scenes/main.tscn' });
  });
});
