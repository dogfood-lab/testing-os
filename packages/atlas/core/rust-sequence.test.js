import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildArtifact } from '../adapter/artifact.js';
import { buildPage } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/rust-sequence: a binary's main calling through a module it
// declares, a type and a function it imports and a local function (see the
// fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/rust-sequence');
const BOUNDARIES = [
  { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  { name: 'src', globs: ['src/**'], role: 'code' },
];
const roots = [];
let mapped;
let main;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  mapped = mapRepository({ repoPath: root, boundaries: BOUNDARIES });
  main = mapped.boundaries.find((boundary) => boundary.name === 'src').files.find((file) => file.path === 'src/main.rs');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the order of work in a Rust binary', () => {
  it('starts from fn main', () => {
    assert.equal(main.entry, 'main');
    assert.equal(main.entryRule, 1);
  });

  it('follows each call through the module, the type and the function it goes through, in order', () => {
    const calls = main.sequences.find((sequence) => sequence.name === 'main').calls
      .map((call) => [call.name, call.target?.file ?? null, call.via ?? null, call.branch ?? null, call.receiver ?? null]);
    assert.deepEqual(calls, [
      ['load', 'src/config.rs', null, null, null],
      ['usage', 'src/config.rs', null, 'settings.help', null],
      ['new', 'src/engine.rs', null, null, 'Engine'],
      ['validate', 'src/config.rs', 'prepare', null, null],
      ['run', 'src/engine.rs', null, null, null],
      ['draw', 'src/render.rs', null, null, null],
    ]);
  });

  it('follows the entry into the functions it calls, as for the other languages', () => {
    const run = main.sequences.find((sequence) => sequence.name === 'main').calls.find((call) => call.name === 'run');
    assert.deepEqual((run.inner ?? []).map((call) => [call.name, call.target?.file ?? null]), [['record', 'src/telemetry.rs']]);
  });

  it('says the steps on the page', () => {
    const structure = buildArtifact(mapped, '0'.repeat(40));
    const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/rust-sequence' });
    assert.match(markdown, /Inside src\/main\.rs, `main` does, in order: `load`, `new` \(Engine\), `validate`, `run` and `draw`\./);
    assert.match(markdown, /Or, when `settings\.help`, `main` does `usage` instead\./);
  });
});
