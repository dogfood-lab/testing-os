import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/exports-and-api: a published package with five exported
// files, and a command that changes other repositories through the GitHub API.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/exports-and-api');
const roots = [];
let structure;
let markdown;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [{ name: 'src', globs: ['src/**'], role: 'code' }, { name: 'bin', globs: ['bin/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'config' }];
  structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  markdown = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/exports-and-api' }).markdown;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a package that exports several files', () => {
  it('loads every subpath its exports name, counted past three', () => {
    const pkg = structure.doors.find((door) => door.kind === 'package');
    assert.deepEqual(pkg.runs.map((run) => run.path), ['schema.json', 'src/a.js', 'src/b.js', 'src/c.js', 'src/index.js']);
    // Its entry leads, then the code it loads, then the data it exports.
    assert.equal(pkg.entry, 'src/index.js');
    assert.match(markdown, /\*\*@fixture\/exports-and-api\*\* \(the package people import\)\. Loads src\/index\.js, src\/a\.js, src\/b\.js and 2 more\./);
    // Followed alone, the package is read from its entry.
    const alone = buildPage({ structure: { ...structure, doors: structure.doors.filter((door) => door.kind === 'package') }, statistics: {}, document: {}, repoName: 'fixture/exports-and-api' });
    assert.equal(JSON.parse(alone.json).startHere[0], 'src/index.js');
  });
});

describe('a door that writes through the GitHub API', () => {
  it('says it changes other repositories, and not for a read or a change to its own', () => {
    const sync = structure.doors.find((door) => door.kind === 'command' && door.name === 'sync');
    assert.equal(sync.sends.changesRepositories, true);
    // The suite imports the same code, and the package exports it; neither
    // runs a call.
    assert.equal(structure.doors.find((door) => door.file === '.github/workflows/ci.yml').sends.changesRepositories, undefined);
    assert.equal(structure.doors.find((door) => door.kind === 'package').sends.changesRepositories, undefined);
    assert.match(markdown, /\*\*sync\*\* \(a command people run\) runs bin\/sync\.js, reaches src, and changes other repositories through the GitHub API\./);
  });
});
