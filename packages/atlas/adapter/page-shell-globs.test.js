import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/shell-globs: an unquoted ** in an npm script, which sh
// expands one directory level deep, beside a quoted one node expands itself
// (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/shell-globs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'src', globs: ['src/**'], role: 'code' },
    { name: 'tools', globs: ['tools/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/shell-globs' });
  return { structure, markdown: page.markdown, data: JSON.parse(page.json) };
}

function runs(structure, file) {
  return [...new Set(structure.doors.find((door) => door.file === file).runs.map((run) => run.path))].sort();
}

describe('a glob the shell expands before the runner sees it', () => {
  const { structure, data } = mapped();

  it('runs on Linux what sh selects, ** as one directory level, and a quoted glob as node reads it', () => {
    assert.deepEqual(runs(structure, '.github/workflows/ci.yml'), ['src/deep/b.test.js', 'tools/']);
  });

  it('runs every file on a platform whose shell expands nothing', () => {
    assert.deepEqual(runs(structure, '.github/workflows/matrix.yml'), ['src/', 'src/deep/b.test.js']);
  });

  it('says what CI does not run on Linux, and why, and reports it rather than working around it', () => {
    const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.shellMissed, [{ base: 'src/', files: 3, platform: 'linux', tests: true, twoStars: true }]);
    assert.ok(data.limits.includes('3 test files under `src/` are not run by CI and Matrix on Linux, where the shell expands `**` as one directory level.'), data.limits.join('\n'));
  });
});
