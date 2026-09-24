import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/start-door: a release wider than the pull request's door,
// and two doors tied for the widest (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/start-door');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function page(name, boundaries) {
  const root = makeRepo(join(FIXTURE, name));
  roots.push(root);
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  return buildPage({ structure, statistics: {}, document: {}, repoName: `fixture/${name}` });
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

describe('where to start', () => {
  it('starts from the pull request\'s door, past its tests and its helper, at the entry of what it reaches', () => {
    const { markdown, json } = page('release', [
      { name: 'core', globs: ['packages/core/**'], role: 'code' },
      { name: 'log', globs: ['packages/log/**'], role: 'code' },
      { name: 'scripts', globs: ['scripts/**'], role: 'code' },
      { name: 'server', globs: ['packages/server/**'], role: 'code' },
    ]);
    assert.match(markdown, /the busiest is Release, which reaches 3 parts/);
    assert.ok(section(markdown, 'Where to start').includes('.github/workflows/ci.yml → packages/core/src/index.js\n'), markdown);
    assert.match(section(markdown, 'Where to start'), /Read those in order to follow one pull request end to end\./);
    assert.equal(JSON.parse(json).startDoor, '.github/workflows/ci.yml');
  });

  it('says which of the doors tied for the widest it follows, and why', () => {
    const { markdown, json } = page('tie', [
      { name: 'site', globs: ['site/**'], role: 'code' },
      { name: 'src', globs: ['src/**'], role: 'code' },
    ]);
    assert.match(markdown, /Work enters through 2 doors; CI and Deploy site each reach 1 part, and CI is followed because a pull request goes through it\./);
    assert.equal(JSON.parse(json).mainDoor, '.github/workflows/ci.yml');
    assert.ok(section(markdown, 'Where to start').includes('.github/workflows/ci.yml → src/cli.js\n'), markdown);
  });
});
