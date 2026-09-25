import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/next-app: a Next.js app with the App Router under src/app/,
// built by CI (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/next-app');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a Next.js app', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'studio', globs: ['app/**'], role: 'code' }] });

  it('has its pages, layouts and routes as the part\'s entry points', () => {
    const studio = mapped.boundaries.find((boundary) => boundary.name === 'studio');
    assert.deepEqual([...studio.entryPoints].sort(), ['app/src/app/api/hello/route.ts', 'app/src/app/layout.tsx', 'app/src/app/page.tsx']);
  });

  it('runs the app\'s config and its routes under next build', () => {
    const ci = mapped.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.runs.map((run) => `${run.path} ${run.runKind}`).sort(), ['app/next.config.js executes', 'app/src/app/ executes']);
    assert.ok(ci.runs.every((run) => (run.via ?? '').endsWith('next build')), JSON.stringify(ci.runs));
  });
});
