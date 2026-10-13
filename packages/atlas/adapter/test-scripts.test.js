import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { buildArtifact, TEST_FRAMEWORKS } from './artifact.js';
import { testGaps } from './test-gaps.js';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { SCRIPT_FRAMEWORKS, stripsTypes } from '../core/script-tests.js';

// testing-os#158: scripts named test_* in the JavaScript and TypeScript
// family, a test by what they do (fixtures/atlas/test-scripts, see README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/test-scripts');
const PARTS = [
  { name: 'src', globs: ['src/**'], role: 'code' },
  { name: 'tools', globs: ['tools/**'], role: 'code' },
  { name: 'checks', globs: ['checks/**'], role: 'test' },
  { name: 'collected', globs: ['collected/**'], role: 'test' },
  { name: 'scripts', globs: ['scripts/**'], role: 'code' },
  { name: 'typed', globs: ['typed/**'], role: 'code' },
  { name: 'legacy', globs: ['legacy/**'], role: 'code' },
  { name: 'fixtures', globs: ['fixtures/**'], role: 'data' },
  { name: 'config', globs: ['package.json', 'README.md', 'vitest.config.ts', '.github/**'], role: 'config' },
];
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

const root = makeRepo(FIXTURE);
roots.push(root);
const artifact = buildArtifact(mapRepository({ repoPath: root, boundaries: PARTS }), '0'.repeat(40));
const files = new Map(artifact.boundaries.flatMap((boundary) => boundary.files).map((file) => [file.path, file]));
const gaps = testGaps(artifact, {});
const g2 = gaps.hygiene.filter((entry) => entry.rule === 'G2');
const g2Of = (path) => g2.find((entry) => entry.facts.files.includes(path));

describe('a test_ script, a test by what it does', () => {
  it('is marked a test when it fails by itself and nothing imports it', () => {
    const marked = [...files.values()].filter((file) => file.scriptTest).map((file) => file.path).sort();
    assert.deepEqual(marked, [
      'checks/test_dir_script.mjs',
      'collected/test_collected.mjs',
      'legacy/test_old.ts',
      'tools/test_exit.cjs',
      'tools/test_gate.mjs',
      'tools/test_more.js',
      'tools/test_named.mjs',
      'tools/test_relative.mjs',
      'tools/test_typed.ts',
      'typed/test_strip.ts',
    ]);
  });

  it('is not a test when a file imports it, when it checks nothing, or among fixtures', () => {
    for (const path of ['tools/test_helpers.mjs', 'tools/test_notes.mjs', 'fixtures/test_fixture.mjs']) {
      assert.equal(files.get(path)?.scriptTest, undefined, path);
    }
  });

  it('is counted run inside a directory a runner is handed: a stated limit, on the side of no false gap', () => {
    // node --test collects only its default names under checks/, but a
    // directory a runner is handed counts every file under it as run.
    const ran = artifact.doors.filter((door) => !door.kind).flatMap((door) => (door.runs ?? []).map((run) => run.path));
    assert.ok(ran.includes('checks/'), ran.join(', '));
    assert.equal(artifact.testsNotRun.includes('checks/test_dir_script.mjs'), false);
    assert.equal(g2Of('checks/test_dir_script.mjs'), undefined);
  });

  it('is collected where a runner\'s include names test_*, and then no gap', () => {
    assert.equal(artifact.testsNotRun.includes('collected/test_collected.mjs'), false);
    assert.equal(g2Of('collected/test_collected.mjs'), undefined);
  });
});

describe('G2 for a test_ script no workflow runs', () => {
  it('says to run each JavaScript script on node, from its own folder', () => {
    const node = g2Of('tools/test_gate.mjs');
    assert.deepEqual(node.facts.files, ['tools/test_exit.cjs', 'tools/test_gate.mjs', 'tools/test_more.js', 'tools/test_relative.mjs', 'typed/test_strip.ts']);
    assert.equal(node.suggest.runner, 'node');
    assert.match(node.suggest.text, /^run each in a workflow step from its own folder \(working-directory: tools, run: node test_exit\.cjs; working-directory: tools, run: node test_gate\.mjs; working-directory: tools, run: node test_more\.js and 2 more\)/);
    assert.match(node.source.text, /discovery/);
  });

  it('runs a script from its own folder, since it may read beside it by a relative path', () => {
    // R&D's spot check of #158: ai-jam-sessions' test_tools_local.py opens
    // app.py relative to its folder, so a run from the root fails first.
    assert.deepEqual(files.get('tools/test_relative.mjs').selfRun, { in: 'tools', run: 'node test_relative.mjs' });
  });

  it('runs TypeScript on the runner the manifest lists, or on node where engines strip types', () => {
    const typed = g2Of('tools/test_typed.ts');
    assert.deepEqual(typed.facts.files, ['tools/test_typed.ts']);
    assert.equal(typed.suggest.runner, 'npx tsx');
    assert.match(typed.suggest.text, /working-directory: tools, run: npx tsx test_typed\.ts/);
    // typed/ allows only Node that strips types, so its script runs on node.
    assert.ok(g2Of('typed/test_strip.ts').facts.files.includes('typed/test_strip.ts'));
    assert.equal(g2Of('typed/test_strip.ts').suggest.runner, 'node');
  });

  it('names no command for TypeScript on a Node that strips no types and no runner', () => {
    const old = g2Of('legacy/test_old.ts');
    assert.deepEqual(old.facts.files, ['legacy/test_old.ts']);
    assert.equal(old.suggest.runner, undefined);
    assert.match(old.suggest.text, /TypeScript runner such as tsx/);
  });

  it('says to name a script written for a framework in its run, since discovery never collects it', () => {
    const named = g2Of('tools/test_named.mjs');
    assert.deepEqual(named.facts.files, ['tools/test_named.mjs']);
    assert.equal(named.suggest.runner, 'node --test');
    assert.match(named.suggest.text, /name each file in the node --test run/);
  });

  it('runs a Python test that fails by itself, under its __main__ guard or at module level, where no runner covers it', () => {
    // test_flat.py ends with sys.exit at module level, as ai-jam-sessions'
    // spaces/jam-actions-live/test_tools_local.py does (the #158 recall check).
    const python = g2Of('scripts/test_check.py');
    assert.deepEqual(python.facts.files, ['scripts/test_check.py', 'scripts/test_flat.py']);
    assert.equal(python.suggest.runner, 'python');
    assert.match(python.suggest.text, /working-directory: scripts, run: python test_check\.py; working-directory: scripts, run: python test_flat\.py/);
  });

  it('stays silent on a Python test of bare asserts with no exit, or one that exits inside a function called at module level: stated limits', () => {
    assert.equal(g2Of('scripts/test_bare.py'), undefined);
    assert.equal(g2Of('scripts/test_main_call.py'), undefined);
  });

  it('stays silent on a helper, a script that checks nothing, and fixture material', () => {
    for (const path of ['tools/test_helpers.mjs', 'tools/test_notes.mjs', 'fixtures/test_fixture.mjs']) assert.equal(g2Of(path), undefined, path);
  });
});

describe('the evidence rules', () => {
  it('reads the same JavaScript test frameworks as the adapter', () => {
    const adapter = TEST_FRAMEWORKS.map(([pattern]) => pattern.source).filter((source) => !/pytest|unittest/.test(source)).sort();
    assert.deepEqual(SCRIPT_FRAMEWORKS.map((pattern) => pattern.source).sort(), adapter);
  });

  it('strips types only where every Node the range admits does', () => {
    for (const range of ['>=22.18.0', '^22.18.0', '>=23.6', '>=24', '24.x']) assert.equal(stripsTypes(range), true, range);
    for (const range of ['>=20', '^22.17.0', '>=23.5', '>=18 || >=22.18', '*', '<24', undefined]) assert.equal(stripsTypes(range), false, String(range));
  });
});
