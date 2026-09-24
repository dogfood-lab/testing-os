import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/package-managers: one job per manager, each starting the
// package scripts a different way; pnpm's workspace is pnpm-workspace.yaml.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/package-managers');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function runsByJob() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const { doors } = mapRepository({ repoPath: root, boundaries: [{ name: 'scripts', globs: ['scripts/**'] }] });
  const ci = doors.find((door) => door.file === '.github/workflows/ci.yml');
  const by = {};
  for (const run of ci.runs) (by[run.job] ??= []).push(run.path);
  return by;
}

describe('package scripts started by any manager', () => {
  it('follows pnpm by name, by run, through a script that calls more, across -r and --filter', () => {
    assert.deepEqual(runsByJob().pnpm, [
      'packages/a/test/',
      'packages/b/lint.mjs',
      'packages/b/test/',
      'scripts/build.mjs',
      'scripts/pack-smoke.mjs',
      'test/',
    ]);
  });

  it('follows yarn by name and through workspace, and bun run', () => {
    const by = runsByJob();
    assert.deepEqual(by.yarn, ['packages/a/start.mjs', 'scripts/smoke.mjs']);
    assert.deepEqual(by.bun, ['scripts/bun-task.mjs']);
  });
});
