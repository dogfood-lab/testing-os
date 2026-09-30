import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { makeRepo } from './fixture-repo.js';
import { mapRepository } from './index.js';

/**
 * The Pages-door regression fixture (docs/atlas-production.spec.md, Part 7):
 * the step shapes found on fleet Pages doors each resolve astro build to the
 * site part, with the files it runs and a reach into the site. A door left
 * empty in any of them is the defect maps made by 1.14.0 carry, and is red
 * here (fixtures/atlas/pages-doors).
 */

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/pages-doors');
const root = makeRepo(FIXTURE);
after(() => rmSync(root, { recursive: true, force: true }));

const artifact = buildArtifact(mapRepository({
  repoPath: root,
  boundaries: [
    { name: 'site', globs: ['site/**'], role: 'code' },
    { name: 'root', globs: ['*'], role: 'config' },
    { name: 'workflows', globs: ['.github/**'], role: 'config' },
  ],
}), '0'.repeat(40));

const SHAPES = [
  ['working-directory.yml', 'working-directory: site with npm run build'],
  ['one-line.yml', 'npm ci && npm run build on one line'],
  ['prefix.yml', '--prefix site'],
  ['cd.yml', 'cd site &&'],
  ['workflow-defaults.yml', 'defaults.run.working-directory at the workflow'],
  ['job-defaults.yml', 'defaults.run.working-directory at the job'],
];

describe('a Pages door in each shape the fleet writes it', () => {
  for (const [file, shape] of SHAPES) {
    it(`resolves astro build to the site part: ${shape}`, () => {
      const door = artifact.doors.find((entry) => entry.file === `.github/workflows/${file}`);
      assert.ok(door, file);
      assert.equal(door.sends.deploysPages, true, file);
      const runs = door.runs.filter((run) => run.runKind === 'executes').map((run) => run.path);
      assert.ok(runs.includes('site/astro.config.mjs'), `${file} runs ${JSON.stringify(runs)}`);
      assert.ok(runs.some((path) => path.startsWith('site/src/')), `${file} runs ${JSON.stringify(runs)}`);
      assert.ok(door.reach.some((entry) => entry.boundary === 'site'), `${file} reaches ${JSON.stringify(door.reach)}`);
      const build = door.commands.find((command) => command.programs.includes('npm') && command.step === 'Build');
      assert.ok(build, `${file} keeps its build step`);
    });
  }
});
