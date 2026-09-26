import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { buildArtifact } from './artifact.js';
import { testGaps } from './test-gaps.js';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';

// The test-gap rules, their ranking and their size (docs/atlas-test-gaps.spec.md,
// acceptance 3, 6 and 7): each rule fires on the gaps fixture and stays silent
// on gaps-quiet, where each of its shapes is closed.

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const PARTS = [
  { name: 'src', globs: ['src/**'], role: 'code' },
  { name: 'lib', globs: ['lib/**'], role: 'code' },
  { name: 'tools', globs: ['tools/**'], role: 'code' },
  { name: 'bin', globs: ['bin/**'], role: 'code' },
  { name: 'test', globs: ['test/**', 'e2e/**'], role: 'test' },
  { name: 'config', globs: ['package.json', 'README.md', '.github/**'], role: 'config' },
];
// History pins the order of two gaps otherwise tied, and one part.
const STATISTICS = { churn: { files: [{ path: 'src/index.ts', commits: 5, lines: 50 }, { path: 'src/extra.ts', commits: 1, lines: 5 }, { path: 'bin/gapcli.js', commits: 3, lines: 9 }] } };
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function gapsOf(fixture) {
  const root = makeRepo(resolve(FIXTURES, fixture));
  roots.push(root);
  return testGaps(buildArtifact(mapRepository({ repoPath: root, boundaries: PARTS }), '0'.repeat(40)), { statistics: STATISTICS });
}

const fired = gapsOf('gaps');
const quiet = gapsOf('gaps-quiet');
const ofRule = (result, rule) => [...result.suggestions, ...result.hygiene, ...result.commands].filter((entry) => entry.rule === rule);

describe('G1 no-runner', () => {
  it('fires for a code part no test reaches whose kind no runner here covers, and names the runner and its source', () => {
    const [g1] = ofRule(fired, 'G1');
    assert.equal(g1.part, 'tools');
    assert.deepEqual(g1.kind, { kind: 'python', label: 'Python library or CLI' });
    assert.equal(g1.suggest.runner, 'pytest with pytest-cov');
    assert.equal(g1.source.from, 'fleet');
    assert.equal(ofRule(fired, 'G1').length, 1);
  });

  it('stays silent where a test of that kind exists', () => {
    assert.deepEqual(ofRule(quiet, 'G1'), []);
  });
});

describe('G2 tests-not-run', () => {
  it('fires for a test file no workflow runs, with the runner\'s own discovery', () => {
    const [g2] = ofRule(fired, 'G2');
    assert.deepEqual(g2.facts.files, ['e2e/flow.test.ts']);
    assert.equal(g2.suggest.runner, 'vitest');
    assert.match(g2.suggest.text, /--dir/);
  });

  it('stays silent when every test file runs', () => {
    assert.deepEqual(ofRule(quiet, 'G2'), []);
  });
});

describe('G3 command-untested', () => {
  it('fires for an installed command no test runs, citing shipcheck\'s smoke gate', () => {
    const [g3] = ofRule(fired, 'G3');
    assert.equal(g3.facts.command, 'gapcli');
    assert.equal(g3.facts.entry, 'bin/gapcli.js');
    assert.match(g3.source.text, /shipcheck hard gate D1/);
  });

  it('stays silent when a test runs the command', () => {
    assert.deepEqual(ofRule(quiet, 'G3'), []);
  });
});

describe('G4 no-coverage', () => {
  it('fires when CI runs tests and collects no coverage, citing the house recipe', () => {
    const [g4] = ofRule(fired, 'G4');
    assert.deepEqual(g4.facts.runners, ['vitest']);
    assert.match(g4.suggest.text, /@vitest\/coverage-v8/);
    assert.equal(g4.source.text, 'the Full Treatment, Phase 4');
  });

  it('stays silent when the runs collect coverage', () => {
    assert.deepEqual(ofRule(quiet, 'G4'), []);
  });
});

describe('G6 failure-paths', () => {
  it('fires for error handling in a file no test imports or runs, naming the constructs', () => {
    const [g6] = ofRule(fired, 'G6');
    assert.equal(g6.path, 'src/parse.ts');
    assert.deepEqual(g6.facts.constructs, ['the catch in parse (line 6)', 'the throw in parse (line 7)']);
    assert.equal(g6.suggest.runner, 'Vitest for TypeScript, node --test for plain-JS packages');
  });

  it('stays silent when a test imports the file', () => {
    assert.deepEqual(ofRule(quiet, 'G6'), []);
  });
});

describe('ranking and size', () => {
  it('ranks code gaps by door path, fan-in, history, failure paths and path, five at most with a count of the rest', () => {
    assert.deepEqual(fired.gaps.items.map((item) => item.path ?? item.part), ['src/format.ts', 'src/parse.ts', 'src/index.ts', 'src/extra.ts', 'lib']);
    assert.equal(fired.gaps.rest, 2);
  });

  it('leads each gap with what would reach it', () => {
    assert.deepEqual(fired.gaps.items[0].wouldReach, { runners: ['vitest'] });
  });

  it('lists hygiene items apart from code gaps', () => {
    assert.deepEqual(fired.hygiene.map((entry) => entry.rule).sort(), ['G2', 'G4']);
    assert.equal(fired.gaps.items.some((item) => item.rule === 'G2' || item.rule === 'G4'), false);
  });
});
