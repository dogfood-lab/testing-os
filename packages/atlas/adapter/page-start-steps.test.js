import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/start-steps: every arrow of "Where to start" is an import
// or a call of the file before it (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/start-steps');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function page(name, parts) {
  const root = makeRepo(join(FIXTURE, name));
  roots.push(root);
  const boundaries = parts.map((part) => ({ name: part, globs: [`${part}/**`], role: part === 'test' ? 'test' : 'code' }));
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: `fixture/${name}` });
  return { markdown: built.markdown, data: JSON.parse(built.json), structure };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end).trim();
}

// Each arrow between two files the map read, with whether the file before
// imports the file after or calls into it.
function unrecorded(structure, chain) {
  const fileOf = new Map(structure.boundaries.flatMap((boundary) => boundary.files).map((file) => [file.path, file]));
  const calls = (file, target) => (file.sequences ?? []).some((sequence) => (sequence.calls ?? []).some((call) => call.target?.file === target));
  const wrong = [];
  for (let i = 0; i + 1 < chain.length; i += 1) {
    const [from, to] = [fileOf.get(chain[i]), chain[i + 1]];
    if (!from || !fileOf.has(to)) continue;
    if (!(from.importsFiles ?? []).includes(to) && !calls(from, to)) wrong.push(`${chain[i]} → ${to}`);
  }
  return wrong;
}

describe('where to start: every arrow is a step', () => {
  it('lists the files the entry calls that lead nowhere beside the path, never chained to the next', () => {
    const { markdown, data, structure } = page('siblings', ['src', 'test']);
    assert.deepEqual(data.startHere, ['src/cli.js', 'src/run.js', 'src/score.js']);
    assert.deepEqual(unrecorded(structure, data.startHere), []);
    assert.deepEqual(data.startBeside, [{ files: ['src/banner.js', 'src/load.js'], from: 'src/cli.js' }]);
    const start = section(markdown, 'Where to start');
    assert.ok(!start.includes('src/banner.js → src/load.js'), start);
    assert.ok(start.includes('src/cli.js → src/run.js → src/score.js'), start);
    assert.ok(start.includes('Beside the path, src/cli.js also calls src/banner.js and src/load.js.'), start);
  });

  it('follows a lazy import inside the function the file before calls', () => {
    const { markdown, data, structure } = page('lazy', ['app']);
    assert.deepEqual(data.startHere, ['.github/workflows/ci.yml', 'app/__main__.py', 'app/__init__.py', 'app/ui.py', 'app/render.py']);
    assert.deepEqual(unrecorded(structure, data.startHere), []);
    const start = section(markdown, 'Where to start');
    assert.ok(!start.includes('app/flags.py → app/__init__.py'), start);
    assert.ok(start.includes('Beside the path, app/__main__.py also calls app/flags.py.'), start);
  });

  it('goes into a package index for a call whose work it cannot read, and on only by what the index imports', () => {
    const { data, structure } = page('handed', ['app']);
    assert.deepEqual(data.startHere.slice(0, 3), ['.github/workflows/ci.yml', 'app/__main__.py', 'app/__init__.py']);
    assert.ok(!data.startHere.includes('app/flags.py'), data.startHere.join(' → '));
    assert.deepEqual(unrecorded(structure, data.startHere), []);
    assert.deepEqual(data.startBeside, [{ files: ['app/flags.py'], from: 'app/__main__.py' }]);
  });

  it('goes from a library root to a module through the module that declares it', () => {
    const root = makeRepo(join(FIXTURE, 'library'));
    roots.push(root);
    const boundaries = [{ name: 'planner', globs: ['crates/planner/**'], role: 'code' }, { name: 'desk', globs: ['src/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'config' }];
    const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
    const data = JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/library' }).json);
    assert.deepEqual(data.startHere, ['src/main.rs', 'src/lib.rs', 'src/commands/mod.rs', 'src/commands/plan.rs', 'crates/planner/src/lib.rs']);
    assert.deepEqual(unrecorded(structure, data.startHere).filter((arrow) => arrow !== 'src/main.rs → src/lib.rs'), []);
  });
});
