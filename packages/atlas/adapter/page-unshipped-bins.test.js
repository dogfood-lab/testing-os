import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unshipped-bins: a binary CI builds, one a workflow
// publishes, and one nothing ships (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unshipped-bins');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a crate binary nothing ships', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'console', globs: ['crates/console/**'], role: 'code' },
    { name: 'pub', globs: ['crates/pub/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'tool', globs: ['crates/tool/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unshipped-bins' });
  const data = JSON.parse(page.json);
  const door = (name) => structure.doors.find((entry) => entry.name === name);

  it('marks only the binary no workflow builds and no publish sends', () => {
    assert.equal(door('console').unshipped, true);
    assert.equal(door('tool').unshipped, undefined);
    assert.equal(door('pub-tool').unshipped, undefined);
  });

  it('says what it is, where it is built from and that nothing ships it, and never that people run it', () => {
    assert.match(data.derived, / People run pub-tool and tool\. console is a command built from crates\/console \(nothing ships it\)\.$/, data.derived);
    assert.match(page.markdown, /\*\*console\*\* \(a command built from crates\/console, which nothing ships\)\. Runs crates\/console\/src\/main\.rs\./);
    const console = data.doors.find((entry) => entry.name === 'console');
    assert.equal(console.unshipped, true);
    assert.equal(console.builtFrom, 'crates/console');
  });
});
