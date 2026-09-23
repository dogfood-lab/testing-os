import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/authored-caveat: a test that rewrites a committed table
// under docs/ through import.meta.dirname, and a translation script whose
// output names are built at run time beside the README it reads.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/authored-caveat');
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
  const root = mkdtempSync(join(tmpdir(), 'atlas-authored-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'authored-caveat']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what Hand-authored may claim', () => {
  it('lands a test\'s write fixed to its own file on the committed place it rewrites', () => {
    const table = structure.landings.find((landing) => landing.target === 'docs/alignment/table.json');
    assert.deepEqual(table?.writers.map((entry) => entry.by), ['packages/export/src/__tests__/table.test.ts'], JSON.stringify(structure.landings));
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'docs').origin, 'mixed');
  });

  it('keeps a scratch file a test names at run time beside itself out of what the repository writes', () => {
    const src = structure.landings.find((landing) => landing.target === 'packages/export/src');
    assert.equal(src, undefined, JSON.stringify(structure.landings));
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'export').origin, 'authored');
  });

  it('counts a write whose name is built at run time beside the root as unnamed', () => {
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'scripts').dynamicWrites, 1);
  });

  it('says unnamed writes may land in what people write, rather than that nothing does', () => {
    assert.deepEqual(section('## Hand-authored'), [
      '## Hand-authored',
      '',
      'People write the repository root; 1 write with a path built at run time may land here.',
    ]);
  });
});
