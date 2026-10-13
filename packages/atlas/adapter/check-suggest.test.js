import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { parseDocument } from 'yaml';

// docs/atlas-buildup.spec.md, slice AM, item AM-1: when check fails with
// ATLAS_UNASSIGNED_NEW it prints the boundary lines that would give each
// offending file a part. The oracle is the person's next move: paste the
// lines, stage, map, and check passes.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function write(repo, path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

/** A committed, mapped repository from a boundary file and its files. */
function mappedRepo(boundaries, files) {
  const repo = mkdtempSync(join(tmpdir(), 'atlas-suggest-'));
  roots.push(repo);
  git(repo, ['init', '--quiet']);
  for (const [path, text] of Object.entries(files)) write(repo, path, text);
  write(repo, 'atlas/boundaries.yaml', boundaries);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'repo']);
  const mapped = atlas(repo, ['map']);
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'map']);
  return repo;
}

function addFiles(repo, files) {
  for (const [path, text] of Object.entries(files)) write(repo, path, text);
  git(repo, ['add', '-A']);
}

/**
 * The printed suggestion: everything after the failure's exit line up to
 * the notices, if any.
 */
function suggestionOf(stdout) {
  const start = stdout.indexOf('\nexit 1\n');
  assert.notEqual(start, -1, stdout);
  const rest = stdout.slice(start + '\nexit 1\n'.length);
  const end = rest.indexOf('\nNotices\n');
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/**
 * Apply the printed lines as a person would: each "a new part" block is
 * pasted at the end of boundaries, each "in part X" block at the end of
 * part X's globs. The lines are parsed as YAML, so a block that is not
 * valid YAML fails here.
 */
function applySuggestion(repo, printed) {
  const path = join(repo, 'atlas', 'boundaries.yaml');
  const doc = parseDocument(readFileSync(path, 'utf8'));
  const lines = printed.split('\n');
  let index = lines.indexOf('Lines for atlas/boundaries.yaml');
  assert.notEqual(index, -1, printed);
  index += 1;
  while (index < lines.length && lines[index] !== '') {
    const heading = lines[index];
    const block = [];
    index += 1;
    while (index < lines.length && lines[index].startsWith(' ')) block.push(lines[index++]);
    if (heading === 'a new part, at the end of boundaries:') {
      const parsed = parseDocument(block.join('\n')).toJS();
      for (const part of parsed) doc.get('boundaries').add(doc.createNode(part));
      continue;
    }
    const match = /^in part (.+), at the end of its globs:$/.exec(heading);
    assert.ok(match, `unexpected heading: ${heading}`);
    const globs = parseDocument(block.join('\n')).toJS();
    const part = doc.get('boundaries').items.find((item) => item.get('name') === match[1]);
    assert.ok(part, `no part ${match[1]}`);
    for (const glob of globs) part.get('globs').add(glob);
  }
  writeFileSync(path, doc.toString());
}

function fixAndCheck(repo, stdout) {
  applySuggestion(repo, suggestionOf(stdout));
  git(repo, ['add', '-A']);
  const mapped = atlas(repo, ['map']);
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  git(repo, ['add', '-A']);
  return atlas(repo, ['check']);
}

const BASE = `boundaries:
  - name: src
    globs:
      - src/**
    role: code
  - name: root
    globs:
      - "*"
    role: config
`;

describe('atlas check: the boundary lines for a new file in no part', () => {
  it('suggests a new data part for a folder no glob reaches, as interlock\'s receipts/', () => {
    const repo = mappedRepo(BASE, {
      'src/route.py': 'def route():\n    return 1\n',
      'receipts/e5-2026-10-12.jsonl': '{"run": 1}\n',
      'pyproject.toml': '[project]\nname = "interlock"\n',
    });
    addFiles(repo, { 'receipts/e5-2026-10-13.jsonl': '{"run": 2}\n' });
    const result = atlas(repo, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /ATLAS_UNASSIGNED_NEW/);
    assert.match(result.stdout, /what to do: {5}add the lines below to atlas\/boundaries\.yaml, stage the new files, run atlas map and commit atlas\/; or revert the change/);
    assert.equal(suggestionOf(result.stdout), [
      '',
      'Lines for atlas/boundaries.yaml',
      'a new part, at the end of boundaries:',
      '  - name: receipts',
      '    globs:',
      '      - receipts/**',
      '    role: data',
      '',
    ].join('\n'));
    const fixed = fixAndCheck(repo, result.stdout);
    assert.equal(fixed.status, 0, fixed.stdout);
  });

  it('suggests a root part, glob "*", for a new file at the top level', () => {
    const repo = mappedRepo(`boundaries:
  - name: src
    globs:
      - src/**
    role: code
`, { 'src/index.js': 'export const one = 1;\n' });
    addFiles(repo, { 'NOTES.md': '# Notes\n' });
    const result = atlas(repo, ['check']);
    assert.equal(result.status, 1, result.stdout);
    const printed = suggestionOf(result.stdout);
    assert.match(printed, /^ {2}- name: root\n {4}globs:\n {6}- "\*"\n {4}role: docs$/m);
    const fixed = fixAndCheck(repo, result.stdout);
    assert.equal(fixed.status, 0, fixed.stdout);
  });

  it('adds a glob to the part that already reaches into the folder', () => {
    const repo = mappedRepo(`boundaries:
  - name: src
    globs:
      - src/*.py
    role: code
  - name: root
    globs:
      - "*"
    role: config
`, { 'src/main.py': 'print(1)\n', 'README.md': '# r\n' });
    addFiles(repo, { 'src/sub/helper.py': 'def helper():\n    return 2\n' });
    const result = atlas(repo, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(suggestionOf(result.stdout), [
      '',
      'Lines for atlas/boundaries.yaml',
      'in part src, at the end of its globs:',
      '      - src/sub/**',
      '',
    ].join('\n'));
    const fixed = fixAndCheck(repo, result.stdout);
    assert.equal(fixed.status, 0, fixed.stdout);
  });

  it('suggests one part per folder, in path order, when two folders have new files', () => {
    const repo = mappedRepo(BASE, { 'src/route.py': 'def route():\n    return 1\n', 'README.md': '# r\n' });
    addFiles(repo, { 'table/candidates.json': '{"a": 1}\n', 'receipts/e1.jsonl': '{"run": 1}\n' });
    const result = atlas(repo, ['check']);
    assert.equal(result.status, 1, result.stdout);
    const printed = suggestionOf(result.stdout);
    const receipts = printed.indexOf('  - name: receipts');
    const table = printed.indexOf('  - name: table');
    assert.ok(receipts > -1 && table > receipts, printed);
    const fixed = fixAndCheck(repo, result.stdout);
    assert.equal(fixed.status, 0, fixed.stdout);
  });

  it('never repeats a part name: a folder named like an existing part is added to that part', () => {
    const repo = mappedRepo(`boundaries:
  - name: receipts
    globs:
      - data/receipts/**
    role: data
  - name: root
    globs:
      - "*"
    role: config
`, { 'data/receipts/old.jsonl': '{"run": 0}\n', 'README.md': '# r\n' });
    addFiles(repo, { 'receipts/new.jsonl': '{"run": 1}\n' });
    const result = atlas(repo, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(suggestionOf(result.stdout), [
      '',
      'Lines for atlas/boundaries.yaml',
      'in part receipts, at the end of its globs:',
      '      - receipts/**',
      '',
    ].join('\n'));
    const fixed = fixAndCheck(repo, result.stdout);
    assert.equal(fixed.status, 0, fixed.stdout);
  });

  it('names the file exactly, glob characters escaped, in a folder two parts share', () => {
    const repo = mappedRepo(`boundaries:
  - name: alpha
    globs:
      - lib/a.js
      - lib/a2.js
    role: code
  - name: beta
    globs:
      - lib/b.js
    role: code
  - name: root
    globs:
      - "*"
    role: config
`, { 'lib/a.js': 'export const a = 1;\n', 'lib/a2.js': 'export const a2 = 1;\n', 'lib/b.js': 'export const b = 1;\n', 'README.md': '# r\n' });
    addFiles(repo, { 'lib/[c].js': 'export const c = 1;\n' });
    const result = atlas(repo, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(suggestionOf(result.stdout), [
      '',
      'Lines for atlas/boundaries.yaml',
      'in part alpha, at the end of its globs:',
      '      - lib/[[]c[]].js',
      '',
    ].join('\n'));
    const fixed = fixAndCheck(repo, result.stdout);
    assert.equal(fixed.status, 0, fixed.stdout);
  });

  it('prints no lines for any other failure', () => {
    const repo = mappedRepo(BASE, { 'src/route.py': 'def route():\n    return 1\n', 'README.md': '# r\n' });
    const boundaries = readFileSync(join(repo, 'atlas', 'boundaries.yaml'), 'utf8').replace('src/**', 'src/*.py');
    writeFileSync(join(repo, 'atlas', 'boundaries.yaml'), boundaries);
    const result = atlas(repo, ['check']);
    assert.equal(result.status, 1, result.stdout);
    assert.doesNotMatch(result.stdout, /Lines for atlas\/boundaries\.yaml/);
  });
});
