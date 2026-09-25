import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/cargo-examples: a library crate with two examples, one of
// which CI runs (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/cargo-examples');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('Cargo examples', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'examples', globs: ['examples/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'ship', globs: ['src/**'], role: 'code' },
  ];
  const mapped = mapRepository({ repoPath: root, boundaries });
  const structure = buildArtifact(mapped, '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/cargo-examples' });
  const data = JSON.parse(page.json);

  it('makes each example a door that runs it, and no entry of its part', () => {
    const doors = structure.doors.filter((door) => door.example);
    assert.deepEqual(doors.map((door) => [door.name, door.runs.map((run) => run.path)]), [['export_all', ['examples/export_all.rs']], ['render', ['examples/render/main.rs']]]);
    assert.deepEqual(structure.boundaries.find((boundary) => boundary.name === 'examples').entryPoints, []);
  });

  it('reads cargo run --example in a workflow as running that example', () => {
    const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.runs.map((run) => [run.path, run.runKind]), [['examples/render/main.rs', 'executes']]);
  });

  it('says an example is a command people run with cargo run --example, and never one the manifest installs', () => {
    assert.match(page.markdown, /\*\*export_all\*\* \(a command people run with `cargo run --example export_all`\)\. Runs examples\/export_all\.rs\./);
    assert.ok(!/People run/.test(data.derived), data.derived);
    assert.equal(data.doors.find((door) => door.name === 'export_all').runWith, 'cargo run --example export_all');
  });
});
