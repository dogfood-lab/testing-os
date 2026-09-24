import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/literal-loops: scripts that write inside a for-of over
// literal values. sync-kb.mjs destructures { file, data } from a const array
// of objects whose file is a join from the repository root, and reads each
// file only to compare it with what it would write; emit.mjs does the
// same over an array written inline; plain.mjs loops over two language codes
// and writes docs/README.<lang>.md beside a docs/guide.md people write.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/literal-loops');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function writers(target) {
  return (structure.landings.find((landing) => landing.target === target)?.writers ?? []).map((entry) => entry.by);
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-literal-loops-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'literal-loops']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a write inside a for-of over literal values', () => {
  it('lands on each place a property of each object names', () => {
    assert.deepEqual(writers('src/kb/presets.json'), ['scripts/sync-kb.mjs']);
    assert.deepEqual(writers('src/kb/nodes.json'), ['scripts/sync-kb.mjs']);
    assert.deepEqual(writers('data/presets.json'), ['scripts/emit.mjs']);
    assert.deepEqual(writers('data/nodes.json'), ['scripts/emit.mjs']);
  });

  it('lands on each place a loop over literal strings names, and not on the directory', () => {
    assert.deepEqual(writers('docs/README.fr.md'), ['scripts/plain.mjs']);
    assert.deepEqual(writers('docs/README.ja.md'), ['scripts/plain.mjs']);
    assert.deepEqual(writers('docs'), []);
  });

  it('counts none of them as built at run time', () => {
    assert.equal(section('## What this map cannot see').some((line) => line.includes('built at run time')), false);
    assert.ok(section('## Generated, never hand-edited').includes('- **src/kb/** is written by scripts/sync-kb.mjs.'));
  });
});
