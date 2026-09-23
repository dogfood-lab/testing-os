import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ignoredNotice, readBoundaryFile } from './boundary-file.js';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function repoWith(boundaries) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-boundary-'));
  roots.push(root);
  write(join(root, 'pkg', 'index.js'), 'export const value = 1;\n');
  write(join(root, 'docs', 'guide.md'), '# Guide\n');
  write(join(root, 'atlas', 'boundaries.yaml'), boundaries);
  for (const args of [['init'], ['config', 'core.autocrlf', 'false'], ['add', '-A'], ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'tree']]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  return root;
}

// The shape every file had before the page replaced the acceptance ladder.
const LADDER = [
  'summary: ""',
  'machine_budget: 2500',
  'boundaries:',
  '  - name: pkg',
  '    globs:',
  '      - pkg/**',
  '    status: accepted',
  '    role: code',
  '    reason: the package',
  '    why_from: human',
  '    will_break: nothing imports it',
  '    will_break_from: human',
  '    start_here: pkg/index.js',
  '  - name: docs',
  '    globs:',
  '      - docs/**',
  '    status: proposed',
  '',
].join('\n');

describe('atlas boundary file', () => {
  it('reads past the retired ladder fields with one notice, so an older file still maps and checks', () => {
    const root = repoWith(LADDER);
    const doc = readBoundaryFile(root);
    assert.equal(doc.ok, true, doc.details?.join('\n'));
    assert.deepEqual(doc.ignored, ['machine_budget', 'reason', 'start_here', 'status', 'why_from', 'will_break', 'will_break_from']);
    assert.deepEqual(doc.boundaries, [{ name: 'pkg', globs: ['pkg/**'], role: 'code' }, { name: 'docs', globs: ['docs/**'] }]);
    const notice = 'atlas: ignored fields no longer read from atlas/boundaries.yaml: machine_budget, reason, start_here, status, why_from, will_break, will_break_from\n';
    assert.equal(ignoredNotice(doc), notice);
    const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    assert.ok(mapped.stdout.startsWith(notice));
    assert.equal(mapped.stdout.split('\n').filter((line) => line.startsWith('atlas: ignored')).length, 1);
    const checked = spawnSync(process.execPath, [CLI, 'check'], { cwd: root, encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stdout);
    assert.match(checked.stdout, /boundaries match the committed map/);
  });

  it('derives a role the file leaves out, and records no status', () => {
    const root = repoWith(LADDER);
    assert.equal(spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' }).status, 0);
    const structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
    const byName = new Map(structure.boundaries.map((boundary) => [boundary.name, boundary]));
    assert.equal(byName.get('docs').role, 'docs');
    assert.equal(byName.get('pkg').role, 'code');
    for (const boundary of structure.boundaries) assert.equal('status' in boundary, false);
  });

  it('prints no notice for the new shape', () => {
    const root = repoWith('summary: ""\nboundaries:\n  - name: pkg\n    globs:\n      - pkg/**\n  - name: docs\n    globs:\n      - docs/**\n');
    const doc = readBoundaryFile(root);
    assert.deepEqual(doc.ignored, []);
    assert.equal(ignoredNotice(doc), '');
  });

  it('still rejects a field it never knew and a role outside the four', () => {
    const unknown = readBoundaryFile(repoWith('boundaries:\n  - name: pkg\n    globs: [pkg/**]\n    colour: blue\n'));
    assert.equal(unknown.ok, false);
    assert.deepEqual(unknown.details, ['boundaries[0].colour is not a boundary field']);
    const role = readBoundaryFile(repoWith('boundaries:\n  - name: pkg\n    globs: [pkg/**]\n    role: library\n'));
    assert.equal(role.ok, false);
    assert.deepEqual(role.details, ['boundaries[0].role must be code, test, docs, or config']);
  });
});
