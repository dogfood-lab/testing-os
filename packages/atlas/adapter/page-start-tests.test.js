import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/start-tests: a pull request's door that runs only tests,
// beside two installed commands, beside only a package whose entry is a
// barrel, and beside nothing installed (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/start-tests');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function page(name, parts) {
  const root = makeRepo(join(FIXTURE, name));
  roots.push(root);
  const boundaries = parts.map((part) => ({ name: part, globs: [`${part}/**`], role: 'code' }));
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: `fixture/${name}` });
  return { markdown: built.markdown, data: JSON.parse(built.json) };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

describe('where to start, when the pull request only runs tests', () => {
  it('starts at the command named for the package, and passes a barrel through to what the call reaches', () => {
    const { markdown, data } = page('command', ['engine', 'src', 'tests']);
    assert.deepEqual(data.startHere, ['src/cli.js', 'engine/run.js']);
    assert.equal(data.startDoor, 'package.json#tool');
    const start = section(markdown, 'Where to start');
    assert.ok(start.includes('\nsrc/cli.js → engine/run.js\n'), start);
    assert.match(start, /Read those in order to follow one run of tool end to end\. This path follows tool \(a command people run\) from its entry, since CI runs only tests\./);
    assert.equal(data.startReason, 'This path follows tool (a command people run) from its entry, since CI runs only tests.');
  });

  it('starts past the package entry when it only hands names on', () => {
    const { data } = page('package', ['src', 'tests', 'text']);
    assert.deepEqual(data.startHere, ['src/parse.js', 'text/token.js']);
    assert.equal(data.startDoor, 'package.json#@s/lib');
  });

  it('starts at the file the tests import that does the work, never at a constant', () => {
    const { data } = page('constant', ['src', 'tests']);
    assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'src/work.js']);
    assert.equal(data.startDoor, '.github/workflows/ci.yml');
    assert.equal(data.startReason, undefined);
  });
});
