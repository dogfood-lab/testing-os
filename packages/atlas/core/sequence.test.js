import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { buildArtifact, serializeArtifact } from '../adapter/artifact.js';
import { mapRepository } from './index.js';
import { DOORS, SEQUENCE, makeRepo } from './fixture-repo.js';

const roots = [];
let sequence;
let doors;

function boundariesOf(fixture) {
  return parse(readFileSync(join(fixture, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries.map((boundary) => ({
    name: boundary.name,
    globs: boundary.globs,
    role: boundary.role,
  }));
}

function map(fixture) {
  const root = makeRepo(fixture);
  roots.push(root);
  return mapRepository({ repoPath: root, boundaries: boundariesOf(fixture) });
}

function file(mapped, path) {
  const found = [...mapped.boundaries.flatMap((boundary) => boundary.files), ...mapped.unassigned].find((item) => item.path === path);
  assert.ok(found, path);
  return found;
}

function fn(mapped, path, name) {
  const found = (file(mapped, path).sequences ?? []).find((item) => item.name === name);
  assert.ok(found, `${path} ${name}`);
  return found;
}

// name@line→target, with the flags that change how a call reads.
function calls(list) {
  return list.map((call) => {
    let text = `${call.name}@${call.line}→${call.target?.file ?? call.target?.boundary ?? 'null'}`;
    if (call.via) text += ` via ${call.via}`;
    if (call.passed) text += ' passed';
    return text;
  });
}

before(() => {
  sequence = map(SEQUENCE);
  doors = map(DOORS);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('entry function', () => {
  it('rule 1: a function invoked at top level wins over a wider exported one', () => {
    const top = file(sequence, 'rules/top-level.js');
    assert.equal(top.entry, 'main');
    assert.equal(top.entryRule, 1);
    const main = fn(sequence, 'rules/top-level.js', 'main');
    assert.equal(main.invokedAtTopLevel, true);
    assert.equal(main.exported, false);
    assert.equal(fn(sequence, 'rules/top-level.js', 'wider').calls.length, 3);
  });

  it('rule 1 in Python: the call under an if __name__ guard', () => {
    const guard = file(sequence, 'rules/guard.py');
    assert.equal(guard.entry, 'main');
    assert.equal(guard.entryRule, 1);
    const main = fn(sequence, 'rules/guard.py', 'main');
    assert.equal(main.invokedAtTopLevel, true);
    assert.deepEqual(calls(main.calls), ['summarize@9→lib/util.py', 'publish@5→lib/util.py via helper']);
  });

  it('rule 2: the default export, over an exported main', () => {
    const entry = file(sequence, 'rules/default-export.js');
    assert.equal(entry.entry, 'build');
    assert.equal(entry.entryRule, 2);
    assert.equal(fn(sequence, 'rules/default-export.js', 'build').isDefaultExport, true);
  });

  it('rule 3: an exported run, or a function named for its file, over a wider one', () => {
    assert.equal(file(sequence, 'rules/named.js').entry, 'run');
    assert.equal(file(sequence, 'rules/named.js').entryRule, 3);
    assert.equal(file(sequence, 'rules/publish.js').entry, 'publish');
    assert.equal(file(sequence, 'rules/publish.js').entryRule, 3);
  });

  it('rule 4: the exported function that roots the most work once same-file calls are spliced', () => {
    const widest = file(sequence, 'rules/widest.js');
    assert.equal(widest.entry, 'spliced');
    assert.equal(widest.entryRule, 4);
    assert.equal(fn(sequence, 'rules/widest.js', 'direct').calls.length, 3);
    assert.deepEqual(calls(fn(sequence, 'rules/widest.js', 'spliced').calls), [
      'load@16→lib/steps.js',
      'check@4→lib/steps.js via helper',
      'save@5→lib/steps.js via helper',
      'wrap@6→lib/steps.js via helper',
    ]);
  });
});

describe('sequence of calls', () => {
  it('records the cross-file calls of a function in the order they run', () => {
    assert.deepEqual(calls(fn(sequence, 'rules/calls.js', 'main').calls), [
      'load@8→lib/steps.js',
      'wrap@10→lib/steps.js',
      'save@10→lib/steps.js',
      'wrap@11→lib/steps.js',
      'check@11→lib/steps.js passed',
      'check@12→lib/steps.js',
      'confirm@13→null',
      'load@16→lib/steps.js',
    ]);
  });

  it('reads a call inside an inline callback at the statement that holds it, after the call it is handed to', () => {
    const main = calls(fn(sequence, 'rules/calls.js', 'main').calls);
    assert.equal(main.indexOf('save@10→lib/steps.js'), main.indexOf('wrap@10→lib/steps.js') + 1);
  });

  it('records a function passed as an argument at its position, marked passed', () => {
    const passed = fn(sequence, 'rules/calls.js', 'main').calls.filter((call) => call.passed);
    assert.deepEqual(passed, [{ name: 'check', target: { file: 'lib/steps.js' }, line: 11, passed: true }]);
  });

  it('records a member call on a parameter by name with no target, and skips built-in and callback receivers', () => {
    const main = fn(sequence, 'rules/calls.js', 'main').calls;
    assert.deepEqual(main.filter((call) => call.target == null), [{ name: 'confirm', target: null, line: 13 }]);
    assert.equal(main.some((call) => call.name === 'get' || call.name === 'run'), false);
  });

  it('follows an alias to the import it falls back to', () => {
    assert.ok(calls(fn(sequence, 'rules/calls.js', 'main').calls).includes('check@12→lib/steps.js'));
  });

  it('sees no call in a comment or a string', () => {
    const lines = fn(sequence, 'rules/calls.js', 'main').calls.map((call) => call.line);
    assert.equal(lines.includes(5), false);
    assert.equal(lines.includes(6), false);
  });

  it('keeps the first of consecutive calls to one callee, a namespace member included', () => {
    const lines = fn(sequence, 'rules/calls.js', 'main').calls.filter((call) => call.name === 'load').map((call) => call.line);
    assert.deepEqual(lines, [8, 16]);
  });

  it('puts an eager argument before the call it feeds', () => {
    assert.deepEqual(calls(fn(sequence, 'rules/calls.js', 'eager').calls), ['load@21→lib/steps.js', 'save@21→lib/steps.js']);
  });

  it('caps a function at 24 calls and says it was cut', () => {
    const main = fn(sequence, 'rules/many.js', 'main');
    assert.equal(main.calls.length, 24);
    assert.equal(main.truncated, true);
    assert.equal(fn(sequence, 'rules/calls.js', 'main').truncated, undefined);
  });

  it('records only the files a door runs and the files they call into', () => {
    assert.equal(file(sequence, 'rules/unrun.js').sequences, undefined);
    assert.equal(file(sequence, 'rules/unrun.js').entry, undefined);
    const steps = file(sequence, 'lib/steps.js');
    assert.equal(steps.sequences, undefined);
    assert.equal(steps.entry, undefined);
  });
});

describe('one hop', () => {
  it('reads the door fixture: ingest calls in order, a same-file helper spliced in place', () => {
    const ingest = file(doors, 'tools/ingest.js');
    assert.equal(ingest.entry, 'ingest');
    assert.equal(ingest.entryRule, 1);
    assert.deepEqual(calls(fn(doors, 'tools/ingest.js', 'ingest').calls), [
      'prepare@13→tools/prepare.js',
      'verify@14→lib/verify.js',
      'loadPolicy@15→lib/policy.js',
      'writeRecord@8→lib/store.js via persist',
      'rebuildIndex@9→lib/store.js via persist',
    ]);
  });

  it("attaches the called function's own calls to an entry call, one level only", () => {
    const verify = fn(doors, 'tools/ingest.js', 'ingest').calls.find((call) => call.name === 'verify');
    assert.deepEqual(calls(verify.inner), ['checkSchema@11→lib/schema.js passed', 'checkPolicy@12→lib/policy.js', 'confirm@13→null']);
    assert.equal(verify.inner.some((call) => 'inner' in call), false);
    const hop = file(doors, 'lib/verify.js');
    assert.equal(hop.entry, 'verify');
    assert.equal(hop.entryRule, 3);
    assert.equal(fn(doors, 'lib/verify.js', 'verify').calls.some((call) => 'inner' in call), false);
  });
});

describe('determinism', () => {
  it('writes the same sequences byte for byte from a second copy of each fixture', () => {
    for (const [fixture, first] of [[SEQUENCE, sequence], [DOORS, doors]]) {
      assert.equal(serializeArtifact(buildArtifact(map(fixture), 'fixture')), serializeArtifact(buildArtifact(first, 'fixture')));
    }
  });

  it('carries sequences, entry and entryRule into the artifact only where they were recorded', () => {
    const artifact = JSON.parse(serializeArtifact(buildArtifact(doors, 'fixture')));
    const tools = artifact.boundaries.find((boundary) => boundary.name === 'tools');
    const ingest = tools.files.find((item) => item.path === 'tools/ingest.js');
    assert.equal(ingest.entry, 'ingest');
    assert.equal(ingest.entryRule, 1);
    assert.deepEqual(ingest.sequences.map((item) => item.name), ['persist', 'ingest']);
    const render = tools.files.find((item) => item.path === 'tools/render.js');
    assert.deepEqual(Object.keys(render), ['hash', 'path']);
  });
});
