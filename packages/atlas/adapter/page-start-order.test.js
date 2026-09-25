import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/start-order: "Where to start" inside one part, one
// repository per directory (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/start-order');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function page(name, parts) {
  const root = makeRepo(join(FIXTURE, name));
  roots.push(root);
  const boundaries = parts.map((part) => ({ name: part, globs: [`${part}/**`], role: part === 'test' ? 'test' : 'code' }));
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: `fixture/${name}` });
  return { markdown: built.markdown, data: JSON.parse(built.json) };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end).trim().split('\n');
}

describe('where to start inside one part', () => {
  it('reads the files the entry calls in its own part, in the order it calls them', () => {
    const { markdown, data } = page('own-part', ['src', 'test']);
    assert.deepEqual(data.startHere, ['src/cli.js', 'src/config.js', 'src/run.js', 'src/report.js']);
    const start = section(markdown, 'Where to start');
    assert.equal(start[2], 'src/cli.js → src/config.js → src/run.js → src/report.js');
    assert.equal(start[4], 'Read those in order to follow one run of tool end to end. This path follows tool (a command people run) from its entry, since CI runs only tests.');
  });

  it('with no order of work, reads what the entry imports in the order it imports it', () => {
    const { data } = page('imports', ['src', 'test']);
    assert.deepEqual(data.startHere, ['src/cli.js', 'src/init.js', 'src/add.js', 'src/build.js']);
  });

  it('breaks a tie among a part\'s files by the call the entry makes first, never by name', () => {
    const { data } = page('tie-calls', ['bin', 'lib']);
    assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'bin/tool.js', 'lib/gamma.js']);
  });

  it('with no call to tell them apart, goes to the one that reaches the most parts', () => {
    const { data } = page('tie-reach', ['bin', 'lib', 'util']);
    assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'bin/tool.js', 'lib/b.js', 'util/deep.js']);
  });

  it('ends the path at a tie nothing breaks', () => {
    const { data } = page('tie-none', ['bin', 'lib']);
    assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'bin/tool.js']);
  });

  it('says what else the pull request does when it runs only tests', () => {
    const { data } = page('checks-too', ['src', 'test']);
    assert.equal(data.startReason, 'This path follows tool (a command people run) from its entry, since CI runs only tests and checks.');
  });

  it('says a path of one file in the singular', () => {
    const { markdown, data } = page('single', ['src', 'test']);
    assert.deepEqual(data.startHere, ['src/cli.js']);
    assert.deepEqual(section(markdown, 'Where to start'), [
      '## Where to start',
      '',
      'Start at src/cli.js to follow one run of tool end to end. This path follows tool (a command people run) from its entry, since CI runs only tests.',
    ]);
  });
});
