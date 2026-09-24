import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/bootstrap-writes: writes made only when the committed file
// is absent (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/bootstrap-writes');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'data', globs: ['data/**'], role: 'data' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
    { name: 'tests', globs: ['tests/**'], role: 'data' },
    { name: 'tools', globs: ['tools/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/bootstrap-writes' });
  return { structure, markdown: page.markdown, data: JSON.parse(page.json) };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

describe('a write made only when the file is absent', () => {
  const { structure, markdown } = mapped();

  it('is no door\'s write, and no stamp', () => {
    const door = structure.doors.find((entry) => entry.file === '.github/workflows/ci.yml');
    assert.deepEqual(door.landings, []);
    for (const target of ['tests/__bench__/baseline.json', 'data/seed.json', 'data/prime.json']) {
      const writers = structure.landings.find((landing) => landing.target === target)?.writers ?? [];
      assert.equal(writers.length, 1, target);
      assert.equal(writers[0].stamps, undefined, target);
      assert.deepEqual(writers[0].unless, ['exists'], target);
    }
  });

  it('is said as written once when absent, and read by its writer', () => {
    assert.match(section(markdown, 'Who reads the results'), /CI writes nothing this map can see\./);
    const generated = section(markdown, 'Generated, never hand-edited');
    assert.ok(generated.includes('- **tests/__bench__/baseline.json** is written once by scripts/bench-gate.mjs when absent.'), generated);
    assert.ok(generated.includes('- **data/seed.json** is written once by scripts/seed.mjs when absent.'), generated);
    assert.ok(generated.includes('- **data/prime.json** is written once by tools/prime.py when absent.'), generated);
    assert.doesNotMatch(generated, /has a block written by/);
    assert.doesNotMatch(section(markdown, 'Written but never read'), /baseline\.json|seed\.json|prime\.json/);
  });
});
