import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/package-publishers: three packages, one repository each, told
// apart only by what publishes them (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/package-publishers');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped(name) {
  const root = makeRepo(join(FIXTURE, name));
  roots.push(root);
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries: [{ name: 'src', globs: ['src/**'], role: 'code' }] }), '0'.repeat(40));
  return { structure, markdown: buildPage({ structure, statistics: {}, document: {}, repoName: `fixture/${name}` }).markdown };
}

describe('the package a manifest names', () => {
  it('is the package people import when a workflow publishes it', () => {
    const { markdown } = mapped('published');
    assert.match(markdown, /\*\*@fixture\/published\*\* \(the package people import\)\. Loads src\/index\.js\./);
    assert.match(markdown, /People import @fixture\/published\./);
  });

  it('is so when it declares itself not private and a release workflow ships it', () => {
    assert.match(mapped('declared').markdown, /\*\*@fixture\/declared\*\* \(the package people import\)/);
  });

  it('is only the package\'s entry when nothing here publishes it', () => {
    const { structure, markdown } = mapped('unpublished');
    assert.equal(structure.doors.find((door) => door.kind === 'package').unpublished, true);
    assert.match(markdown, /\*\*@fixture\/unpublished\*\* \(the package's entry, not published from here\)\. Loads src\/index\.js\./);
    assert.doesNotMatch(markdown, /People import/);
  });
});

describe('what a publish step sends, and which package', () => {
  it('reads vsce and ovsx publish as sends to the marketplaces, and makes the extension a published door', () => {
    const { markdown } = mapped('extension');
    assert.match(markdown, /\*\*runforge\*\* \(the extension people install from Open VSX and the VS Code Marketplace\)\. Loads src\/extension\.ts\./);
    assert.match(markdown, /publishes to Open VSX, and publishes to the VS Code Marketplace when run by hand/);
    assert.match(markdown, /It publishes to Open VSX and the VS Code Marketplace\. People install the runforge extension\./);
    assert.doesNotMatch(markdown, /People import/);
  });

  it('names the package a publish in a working directory or after a cd sends, and reads a dry run as no publish', () => {
    const { structure, markdown } = mapped('member');
    assert.match(markdown, /\*\*Release\*\* runs no file this map can see and publishes @member\/core \(packages\/core\) and @member\/extra \(packages\/extra\) to npm\./);
    assert.deepEqual(structure.doors.find((door) => door.file === '.github/workflows/check.yml').sends.publishesTo, []);
    assert.equal(structure.doors.find((door) => door.kind === 'package').unpublished, true);
  });

  it('says a package chosen at run time from the tag as one of the packages it could be', () => {
    assert.match(mapped('chosen').markdown, /publishes one of the 3 packages under packages\/ to npm, chosen by the tag/);
  });
});
