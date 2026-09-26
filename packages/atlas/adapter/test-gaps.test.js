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
// on gaps-quiet, where each of its shapes is closed. gaps-shapes and
// gaps-frameworks hold the shapes the fleet run found the rules wrong on.

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

function gapsOf(fixture, parts = PARTS) {
  const root = makeRepo(resolve(FIXTURES, fixture));
  roots.push(root);
  return testGaps(buildArtifact(mapRepository({ repoPath: root, boundaries: parts }), '0'.repeat(40)), { statistics: STATISTICS });
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

const shapes = gapsOf('gaps-shapes', [
  { name: 'bin', globs: ['bin/**'], role: 'code' },
  { name: 'src', globs: ['src/**'], role: 'code' },
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  { name: 'fixtures', globs: ['fixtures/**'], role: 'code' },
  { name: 'test', globs: ['test/**'], role: 'test' },
  { name: 'config', globs: ['package.json', 'README.md', 'vitest.config.ts', '.github/**'], role: 'config' },
]);

describe('the shapes the fleet run found the rules wrong on', () => {
  it('reads a script a test step runs, and what it starts, as run by that step (study-swarm)', () => {
    assert.equal(ofRule(shapes, 'G3').some((entry) => entry.facts.command === 'shapecli'), false);
    assert.equal(ofRule(shapes, 'G6').some((entry) => entry.path === 'bin/shapecli.mjs' || entry.path === 'scripts/smoke.mjs'), false);
  });

  it('reads a smoke test by its name as a test, whose throws are its assertions', () => {
    assert.equal(ofRule(shapes, 'G6').some((entry) => entry.path === 'scripts/pack-smoke.mjs'), false);
  });

  it('leaves G3 silent for a command whose entry a test imports and drives (the CliRunner shape)', () => {
    assert.equal(ofRule(shapes, 'G3').some((entry) => entry.facts.command === 'importedcli'), false);
  });

  it('leaves G3 silent for a command a workflow runs as a person would (claude-guardian)', () => {
    assert.equal(ofRule(shapes, 'G3').some((entry) => entry.facts.command === 'dogcli'), false);
  });

  it('names the runner for a file\'s own language, not its part\'s', () => {
    const [g6] = ofRule(shapes, 'G6');
    assert.equal(g6.path, 'scripts/measure.py');
    assert.equal(g6.suggest.runner, 'pytest with pytest-cov');
    assert.equal(g6.source.from, 'fleet');
  });

  it('counts no file among fixtures as a gap', () => {
    assert.deepEqual(ofRule(shapes, 'G6').map((entry) => entry.path), ['scripts/measure.py']);
    assert.equal(shapes.gaps.items.some((item) => (item.path ?? '').startsWith('fixtures/')), false);
  });
});

const frameworks = gapsOf('gaps-frameworks', [
  { name: 'lib', globs: ['lib/**'], role: 'code' },
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  { name: 'test', globs: ['test/**', 'other/**', 'e2e/**', 'ava/**'], role: 'test' },
  { name: 'config', globs: ['package.json', 'README.md', 'vitest.config.ts', '.github/**'], role: 'config' },
]);

describe('G2 and the runner each test file is written for', () => {
  const byRunner = (runner) => ofRule(frameworks, 'G2').find((entry) => entry.suggest.runner === runner);

  it('points a file its runner\'s discovery would collect to that discovery', () => {
    assert.deepEqual(byRunner('vitest').facts.files, ['other/d.test.ts']);
  });

  it('names the framework a file imports when no workflow runs it (vocal-synth-engine)', () => {
    const playwright = byRunner('playwright test');
    assert.deepEqual(playwright.facts.files, ['e2e/b.spec.ts']);
    assert.match(playwright.suggest.text, /run them in CI with playwright test/);
    assert.equal(playwright.source.from, 'external');
    assert.match(playwright.source.text, /@playwright\/test/);
  });

  it('says to quote a glob the shell reads ** in as * (repo-dataset, stillpoint)', () => {
    const node = byRunner('node --test');
    assert.deepEqual(node.facts.files, ['lib/y.test.js']);
    assert.match(node.suggest.text, /quote the glob/);
  });

  it('stays silent for a file its runner\'s configuration leaves out on purpose, and says which', () => {
    assert.equal(ofRule(frameworks, 'G2').some((entry) => entry.facts.files.includes('test/slow/corpus.test.ts')), false);
    assert.deepEqual(frameworks.facts.leftOut, [{ path: 'test/slow/corpus.test.ts', config: 'vitest.config.ts' }]);
  });

  it('stays silent for files a runner whose files Atlas does not list may run', () => {
    assert.equal(ofRule(frameworks, 'G2').some((entry) => entry.facts.files.includes('ava/one.test.js')), false);
    assert.equal(ofRule(frameworks, 'G2').length, 3);
  });

  it('names no runner for a test file that imports no framework when CI runs none of its family (role-os)', () => {
    assert.ok(frameworks.facts.notRun.includes('scripts/test_gate.py'));
    assert.equal(ofRule(frameworks, 'G2').some((entry) => entry.facts.files.includes('scripts/test_gate.py')), false);
  });
});
