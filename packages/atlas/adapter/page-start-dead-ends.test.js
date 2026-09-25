import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/start-dead-ends: "Where to start" inside one part, one
// repository per directory (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/start-dead-ends');
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
  return { markdown: built.markdown, data: JSON.parse(built.json), structure };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end).trim().split('\n');
}

describe('where a path never starts or ends', () => {
  it('never ends on a gate script that imports nothing and writes nothing', () => {
    const { data } = page('gate', ['scripts', 'src', 'test']);
    assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'src/work.js', 'src/shape.js']);
  });

  it('never starts at a file that holds one config object beside its imports', () => {
    const { data, structure } = page('constant', ['site']);
    const file = structure.boundaries[0].files.find((entry) => entry.path === 'site/src/content.config.ts');
    assert.equal(file.constantOnly, true);
    assert.deepEqual(data.startHere, ['.github/workflows/pages.yml', 'site/src/main.ts', 'site/src/render.ts']);
  });
});
