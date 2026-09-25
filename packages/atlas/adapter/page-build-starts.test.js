import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/build-starts: a pull request that builds a package with
// tsup, with a tsc that emits, and with a library's vite build (see its
// README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/build-starts');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function page(name) {
  const root = makeRepo(join(FIXTURE, name));
  roots.push(root);
  const boundaries = [
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
    { name: 'src', globs: ['src/**'], role: 'code' },
    { name: 'test', globs: ['test/**'], role: 'test' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: `fixture/${name}` });
  return { markdown: built.markdown, data: JSON.parse(built.json), structure };
}

function comesIn(markdown) {
  return markdown.split('\n').find((line) => line.startsWith('1. **CI.**'));
}

describe('a door that builds a package', () => {
  for (const [name, built] of [['tsup', 'src/index.ts'], ['tsc', 'src/'], ['vite', 'src/index.ts']]) {
    it(`says the ${name} build as a build and starts at the package's entry`, () => {
      const { markdown, data } = page(name);
      const line = comesIn(markdown);
      assert.ok(line.includes(`builds ${built}`), line);
      assert.ok(!/checks[^.]*src\/index\.ts/.test(line), line);
      assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'src/index.ts', 'src/run.ts', 'src/parse.ts']);
      assert.equal(data.startDoor, '.github/workflows/ci.yml');
      const happens = markdown.split('\n').find((line) => line.startsWith('1. The workflow runs'));
      assert.ok(happens.includes(`it builds ${built} in src`), happens);
    });
  }
});
