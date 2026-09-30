import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { RUNS_RECORDED } from './commands.js';
import { makeRepo } from './fixture-repo.js';
import { buildArtifact } from '../adapter/artifact.js';

// A door that names more scripts than the map records. The scripts sort by
// name, so the last one is the first the recorded list leaves out, and only
// it imports the part `far`: its reach is the door's only when reach is
// walked from every run, not from the recorded ones.

const BOUNDARIES = [
  { name: 'scripts', globs: ['scripts/**'], role: 'code', status: 'accepted' },
  { name: 'near', globs: ['near/**'], role: 'code', status: 'accepted' },
  { name: 'far', globs: ['far/**'], role: 'code', status: 'accepted' },
];
const SCRIPTS = RUNS_RECORDED + 1;

const roots = [];
let door;
let mapped;
let root;

function write(base, path, text) {
  mkdirSync(dirname(join(base, path)), { recursive: true });
  writeFileSync(join(base, path), text);
}

before(() => {
  const staging = mkdtempSync(resolve(tmpdir(), 'atlas-many-runs-'));
  roots.push(staging);
  const names = Array.from({ length: SCRIPTS }, (_, i) => `scripts/s${String(i).padStart(3, '0')}.js`);
  write(staging, 'near/index.js', 'export const near = 1;\n');
  write(staging, 'far/index.js', 'export const far = 1;\n');
  for (const [i, name] of names.entries()) {
    const from = i === SCRIPTS - 1 ? '../far/index.js' : '../near/index.js';
    write(staging, name, `import '${from}';\n`);
  }
  const steps = names.map((name) => `      - run: node ${name}\n`).join('');
  write(staging, '.github/workflows/ci.yml', `name: CI\non: push\njobs:\n  all:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`);
  root = makeRepo(staging);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
  door = mapped.doors.find((item) => item.name === 'CI');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a door that runs more than the map records', () => {
  it('records the first RUNS_RECORDED runs and leaves the last out', () => {
    assert.ok(door);
    assert.equal(new Set(door.runs.map((run) => run.path)).size, RUNS_RECORDED);
    assert.ok(!door.runs.some((run) => run.path === `scripts/s${String(SCRIPTS - 1).padStart(3, '0')}.js`));
  });

  it('walks its reach from every run, so the part only the last run imports is reached', () => {
    assert.deepEqual(door.reach.map((entry) => [entry.boundary, entry.depth]), [['scripts', 0], ['far', 1], ['near', 1]]);
  });

  it('counts every run and says the recorded list is cut', () => {
    assert.equal(door.runsCount, SCRIPTS);
    assert.equal(door.runsCut, true);
  });

  it('carries the marker into the map and leaves no working field behind', () => {
    const carried = buildArtifact(mapped, '0'.repeat(40)).doors.find((item) => item.name === 'CI');
    assert.equal(carried.runsCut, true);
    assert.equal(carried.runsCount, SCRIPTS);
    assert.ok(carried.reach.some((entry) => entry.boundary === 'far'));
    assert.ok(!('allRuns' in door));
  });
});
