import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/cwd-output: a script that writes, under the directory it
// is run from, files the repository commits (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cwd-output');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

describe('committed output of a writer rooted at the working directory', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: '.multi-claude', globs: ['.multi-claude/**'], role: 'data' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
    { name: 'test', globs: ['test/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/cwd-output' });

  it('is generated, written from the repository root and committed', () => {
    const generated = section(markdown, 'Generated, never hand-edited');
    for (const place of ['.multi-claude/drill/attempt-1/prompt.md', '.multi-claude/drill/drill-report.json', '.multi-claude/drill/logs/']) {
      assert.ok(generated.includes(`- **${place}** is written by test/drill/stop-drill.ts (a test) when run from the repository root, and committed.`), generated);
    }
    assert.doesNotMatch(section(markdown, 'Hand-authored'), /\.multi-claude/);
  });

  it('leaves a write under the working directory to a place nothing tracks outside', () => {
    const scripts = structure.boundaries.find((boundary) => boundary.name === 'scripts');
    assert.equal(scripts.outsideWrites, 1);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'test').outsideWrites, undefined);
  });
});
