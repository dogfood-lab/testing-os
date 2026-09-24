import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/rust-tests: a crate tested from tests/, one tested only by
// the unit tests inside it, and one with no test (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/rust-tests');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'bare', globs: ['crates/bare/**'], role: 'code' },
    { name: 'inline', globs: ['crates/inline/**'], role: 'code' },
    { name: 'root', globs: ['*'], role: 'config' },
    { name: 'tested', globs: ['crates/tested/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/rust-tests' });
  return { structure, markdown: page.markdown, data: JSON.parse(page.json) };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

describe('how a Rust crate is tested', () => {
  const { structure, markdown, data } = mapped();
  const part = (name) => structure.boundaries.find((boundary) => boundary.name === name);

  it('counts a file holding its own unit tests as a test of its part, and the file as a test file', () => {
    assert.equal(part('tested').testedBy, 1);
    assert.equal(part('inline').testedBy, 1);
    assert.equal(part('inline').testedInside, true);
    assert.equal(part('bare').testedBy, 0);
    assert.equal(structure.testFiles, 2);
    const inline = part('inline').files.find((file) => file.path === 'crates/inline/src/lib.rs');
    assert.equal(inline.testsInside, true);
  });

  it('names the untested crate, and says which is tested only from inside', () => {
    const untested = section(markdown, 'What no test touches');
    assert.match(untested, /- \*\*bare\*\* is imported by no test\./);
    assert.match(untested, /inline is tested only by the unit tests in its own files\./);
    assert.deepEqual(data.testedInside, ['inline']);
  });
});
