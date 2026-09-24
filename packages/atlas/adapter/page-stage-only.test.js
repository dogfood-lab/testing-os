import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/stage-only: a scheduled sync runs scripts/sync.mjs, which
// writes data/feed.json, hands scripts/report.mjs --out REPORT.md, writes a
// package.json after pushd "$RUNNER_TEMP", then git add -A data/ products/
// NOTES.md REPORT.md. Nothing it runs writes products/ or NOTES.md; staging
// them is how a hand edit rides along with the bot's commit, not a write.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/stage-only');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-stage-only-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'stage-only']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a path git add stages', () => {
  it('is no landing and no writer', () => {
    const sync = structure.doors.find((item) => item.file === '.github/workflows/sync.yml');
    assert.deepEqual(sync.landings, ['REPORT.md', 'data/feed.json']);
    assert.deepEqual(structure.landings.find((landing) => landing.target === 'NOTES.md')?.writers ?? [], []);
    assert.deepEqual(structure.landings.find((landing) => landing.target === 'products')?.writers ?? [], []);
  });

  it('is said as committed, and written by people when nothing the door runs writes it', () => {
    assert.ok(section('## What happens through Sync').includes('3. It commits NOTES.md (written by people), REPORT.md, data/ and products/ (written by people), then pushes.'));
  });

  it('keeps what people write hand-authored', () => {
    assert.deepEqual(section('## Generated, never hand-edited'), [
      '## Generated, never hand-edited',
      '',
      '- **REPORT.md** is written by .github/workflows/sync.yml.',
      '- **data/** is written by scripts/sync.mjs.',
    ]);
    assert.ok(section('## Hand-authored').includes('People write .github/ and products/. Nothing in this repository writes to them.'));
  });
});
