import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/reader-places: the Replay door runs two scripts under
// packages/ledger/scripts/, each writing a receipt beside itself. A page and
// a tool read the receipts. packages/ holds two parts, so it is no place.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/reader-places');
const roots = [];
let markdown;
let json;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-reader-places-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'reader-places']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
  json = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('who reads the results names the place written', () => {
  it('groups the writes of a door in one part under the deepest directory they share', () => {
    const readers = section('## Who reads the results');
    assert.ok(readers.includes('- **packages/ledger/scripts/** is read by docs/receipts.md (found by text) and tools/audit.js.'), readers.join('\n'));
    assert.ok(!readers.some((line) => line.startsWith('- **packages/ledger/**')), readers.join('\n'));
    assert.deepEqual(json.readers.map((group) => group.target), ['packages/ledger/scripts/']);
  });
});
