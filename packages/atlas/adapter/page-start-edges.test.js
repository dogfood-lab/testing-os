import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/start-edges: a pull request's test job, an empty first file,
// a writer the entry reaches in its own part, a reader of what it writes, and
// a wider job held to a path filter.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/start-edges');
const roots = [];
let structure;
let page;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-start-edges-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'start-edges']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

// An arrow is a door running a file, an import, a write, or a read.
function edge(from, to) {
  const files = structure.boundaries.flatMap((boundary) => boundary.files);
  const file = files.find((item) => item.path === from);
  const door = structure.doors.find((item) => item.file === from);
  const landing = (target) => structure.landings.find((item) => item.target === target);
  if (door) return door.runs.some((run) => run.path === to || (run.directory && to.startsWith(run.path)));
  if ((file?.importsFiles ?? []).includes(to)) return true;
  if ((landing(to)?.writers ?? []).some((entry) => entry.by === from)) return true;
  return (landing(from)?.readers ?? []).some((entry) => entry.by === to);
}

describe('where to start', () => {
  it('follows only recorded edges, from a job every pull request runs, past an empty file, to the reader of what it writes', () => {
    assert.deepEqual(page.startHere, ['.github/workflows/ci.yml', 'test/run.test.js', 'src/run.js', 'src/persist.js', 'out/index.json', 'site/app.js']);
    for (let i = 1; i < page.startHere.length; i += 1) {
      assert.ok(edge(page.startHere[i - 1], page.startHere[i]), `${page.startHere[i - 1]} → ${page.startHere[i]}`);
    }
  });

  it('marks a job a path filter holds as one a pull request may not run', () => {
    const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.conditional, ['e2e']);
  });
});
