import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/writer-guards: scripts that will not write in CI (an early
// exit on a name bound to CI, a return on GITHUB_ACTIONS, an if on !CI, and
// the same in Python), and scripts that leave early when a door passes
// --check or --selftest. CI runs them all; a Report door runs one plainly.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/writer-guards');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function door(file) {
  return structure.doors.find((item) => item.file === `.github/workflows/${file}`);
}

function writer(target) {
  return structure.landings.find((landing) => landing.target === target)?.writers ?? [];
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-writer-guards-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'writer-guards']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("a writer's own guards", () => {
  it('credits no workflow with a write the writer skips when CI is set', () => {
    assert.deepEqual(door('ci.yml').landings, []);
  });

  it('credits a door with a write only when its runs of the file do not pass the flag that skips it', () => {
    assert.deepEqual(door('report.yml').landings, ['report.md']);
  });

  it('keeps each write on the writer, with the guards that kept a door from it', () => {
    assert.deepEqual(writer('README.md'), [{ by: 'scripts/sync-version.mjs', confidence: 'ast', stamps: true, unless: ['ci'] }]);
    assert.deepEqual(writer('report.md'), [{ by: 'scripts/gen-report.mjs', confidence: 'ast', unless: ['--selftest'] }]);
    assert.deepEqual(writer('NOTES.md'), [{ by: 'scripts/publish-notes.mjs', confidence: 'ast', unless: ['ci'] }]);
    assert.deepEqual(writer('LOCAL.md'), [{ by: 'scripts/publish-notes.mjs', confidence: 'ast', unless: ['ci'] }]);
    assert.deepEqual(writer('VERSION'), [{ by: 'tools/stamp.py', confidence: 'ast', unless: ['--check', 'ci'] }]);
  });

  it('says on the page when each writer writes', () => {
    assert.deepEqual(section('## Generated, never hand-edited'), [
      '## Generated, never hand-edited',
      '',
      '- **LOCAL.md** is written by scripts/publish-notes.mjs when run outside CI.',
      '- **NOTES.md** is written by scripts/publish-notes.mjs when run outside CI.',
      '- **README.md** has a block written by scripts/sync-version.mjs when run outside CI.',
      '- **VERSION** is written by tools/stamp.py when run outside CI and without --check.',
      '- **report.md** is written by scripts/gen-report.mjs when run without --selftest.',
    ]);
  });
});
