import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/command-files: a release that hands a script to a packager
// the map has no rule for and runs a console script by its path in a
// virtual environment, and three site deploys that build the Astro site
// from site/: by working-directory, by cd, and by npx astro.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/command-files');
const roots = [];
let mapped;

function door(file) {
  const found = mapped.doors.find((item) => item.file === `.github/workflows/${file}`);
  assert.ok(found, file);
  return found;
}

function runs(found) {
  return found.runs.map((run) => `${run.path} ${run.runKind}`).sort();
}

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: parse(readFileSync(join(FIXTURE, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries });
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the files a command is handed', () => {
  it('reads a tracked file handed to a command it has no rule for as checked, a console script as its module, and a bundled entry as run', () => {
    assert.deepEqual(runs(door('release.yml')), ['tools/NOTES.txt checks', 'tools/cf_index.py executes', 'tools/record.py executes']);
  });

  it('resolves a console script through the package-dir its manifest maps', () => {
    const names = mapped.doors.filter((item) => item.kind === 'command').map((item) => `${item.name} ${item.runs.map((run) => run.path).join(' ')}`);
    assert.deepEqual(names.sort(), ['cf-index tools/cf_index.py', 'cf-record tools/record.py']);
  });

  it('builds the site from its own directory, however the step gets there', () => {
    for (const file of ['pages.yml', 'docs.yml', 'preview.yml']) {
      assert.deepEqual(runs(door(file)), ['site/astro.config.mjs executes', 'site/src/ executes'], file);
      assert.ok(door(file).reach.some((entry) => entry.boundary === 'site'), file);
    }
  });
});
