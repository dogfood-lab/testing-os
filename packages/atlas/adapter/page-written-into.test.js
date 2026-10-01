import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { explainTarget } from './explain.js';
import { buildPage } from './page.js';

// fixtures/atlas/written-into: writers that put files into a tracked
// directory beside files they do not make (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/written-into');
const roots = [];
let root;
let structure;
let markdown;
let data;

before(() => {
  root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = ['docs', 'kb', 'out', 'scripts', 'site', 'store', 'tuning'].map((name) => ({ name, globs: [`${name}/**`], role: name === 'scripts' ? 'code' : 'data' }));
  structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/written-into' });
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

describe('a directory its writers only put files into', () => {
  it('is never said to be written when it holds the writer and a page people write', () => {
    const generated = section('Generated, never hand-edited');
    assert.ok(!generated.includes('**kb/** is written by'), generated);
    assert.ok(generated.includes('- **kb/** holds files written by kb/gen.py.'), generated);
    assert.equal(structure.landings.find((landing) => landing.target === 'kb').writesInto, true);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'kb').origin, 'mixed');
    assert.deepEqual(data.generated.find((item) => item.place === 'kb/'), { into: true, place: 'kb/', writers: ['kb/gen.py'] });
  });

  it('is never said to be written when a file below it is none a name read at run time makes', () => {
    const generated = section('Generated, never hand-edited');
    assert.ok(generated.includes('- **docs/** holds files written by scripts/build_docs.py.'), generated);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'docs').origin, 'mixed');
    const unread = section('Written but never read');
    assert.ok(unread.includes('- **docs/** holds files written by scripts/build_docs.py and read by nothing else in this repository.'), unread);
  });

  it('is said to be written when every file in it is one its writer can make', () => {
    const generated = section('Generated, never hand-edited');
    assert.ok(generated.includes('- **out/** is written by scripts/export.py.'), generated);
    assert.ok(generated.includes('- **site/** is written by scripts/pages.py, except site/template.html, which it reads and people write.'), generated);
    assert.equal(structure.landings.find((landing) => landing.target === 'out').writesInto, undefined);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'out').origin, 'generated');
  });

  it('counts the names its writers give in a written directory under it as theirs too', () => {
    const generated = section('Generated, never hand-edited');
    assert.ok(generated.includes('- **store/** is written by scripts/persist.mjs.'), generated);
    assert.equal(structure.landings.find((landing) => landing.target === 'store').writesInto, undefined);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'store').origin, 'generated');
  });

  it('lands a name with a spelled part, written from the directory it is run in, on the files of its shape', () => {
    const generated = section('Generated, never hand-edited');
    assert.ok(generated.includes('- **tuning/matrix-*.json** is written by scripts/tune.mjs when run from the repository root, and committed.'), generated);
    assert.ok(!generated.includes('**tuning/** is written'), generated);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'tuning').origin, 'mixed');
  });

  it('names the writer of a file beside its output as one that writes files into the directory', () => {
    const answer = explainTarget({ structure }, { repo: root, target: 'kb/notes.md' });
    assert.equal(answer.ok, true);
    assert.ok(answer.lines.includes('Written by kb/gen.py (which writes files into kb/).'), answer.lines.join('\n'));
  });
});
