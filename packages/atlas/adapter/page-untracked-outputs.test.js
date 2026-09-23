import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/untracked-outputs: proofs that write into an ignored
// output directory beside the case they read, a metrics file the repository
// ignores beside a tracked registry, and a script that stamps the version
// block of a README people write.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/untracked-outputs');
const roots = [];
let structure;
let page;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function landing(target) {
  return structure.landings.find((item) => item.target === target);
}

function part(name) {
  return structure.boundaries.find((boundary) => boundary.name === name);
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-untracked-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'untracked-outputs']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a write the repository does not track, and a stamped block', () => {
  it('lands a write under an ignored directory on that directory, marked untracked, not on the tracked one above it', () => {
    assert.equal(landing('proofs/output')?.tracked, false, JSON.stringify(structure.landings));
    assert.deepEqual(landing('proofs/output').writers.map((entry) => entry.by), ['proofs/run.mjs']);
    assert.equal(landing('proofs')?.writers.length ?? 0, 0);
    assert.equal(landing('registry/metrics.json')?.tracked, false);
  });

  it('lands no write where a script only makes sure a tracked directory exists', () => {
    assert.equal(landing('registry'), undefined, JSON.stringify(structure.landings));
  });

  it('leaves the parts holding only untracked output hand-authored, and no door writes there', () => {
    assert.equal(part('proofs').origin, 'authored');
    assert.equal(part('registry').origin, 'authored');
    const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.deepEqual(ci.landings, ['README.md']);
  });

  it('marks a write whose writer reads the file first as a stamp, and the part holding it as mixed', () => {
    assert.deepEqual(landing('README.md').writers, [{ by: 'scripts/sync-version.mjs', confidence: 'ast', stamps: true }]);
    assert.equal(part('root').origin, 'mixed');
  });

  it('never warns that a hand edit of a stamped file reaches its readers, since people write it', () => {
    assert.deepEqual(page.breaks.filter((entry) => entry.kind === 'place'), [], JSON.stringify(page.breaks));
  });

  it('says the README has a block written by the stamper, and lists nothing untracked as generated', () => {
    assert.deepEqual(section('## Generated, never hand-edited'), [
      '## Generated, never hand-edited',
      '',
      '- **README.md** has a block written by scripts/sync-version.mjs.',
    ]);
    assert.ok(!section('## Written but never read').some((line) => line.includes('README.md') || line.includes('metrics')), markdown);
    assert.ok(page.limits.includes('2 writes go to places this repository does not track, so they are not listed as generated.'), page.limits.join('\n'));
  });
});
