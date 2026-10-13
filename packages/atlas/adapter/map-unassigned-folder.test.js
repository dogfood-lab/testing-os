import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

// docs/atlas-buildup.spec.md, slice AM, item AM-2: atlas map names each
// top-level folder, and the repository root, that holds tracked files in no
// part, with the lines that would give them one. A notice: the exit code
// and the map are as they were.

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

function repoWith(boundaries, files) {
  const repo = mkdtempSync(join(tmpdir(), 'atlas-folder-'));
  roots.push(repo);
  git(repo, ['init', '--quiet']);
  for (const [path, text] of Object.entries({ ...files, 'atlas/boundaries.yaml': boundaries })) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'repo']);
  return repo;
}

function map(repo) {
  return spawnSync(process.execPath, [CLI, 'map'], { cwd: repo, encoding: 'utf8' });
}

const SRC_ONLY = `boundaries:
  - name: src
    globs:
      - src/**
    role: code
`;

describe('atlas map: the notice for a folder with files in no part', () => {
  it('names each such folder and the root with their counts, and the lines to add', () => {
    const repo = repoWith(SRC_ONLY, {
      'src/route.py': 'def route():\n    return 1\n',
      'receipts/e1.jsonl': '{"run": 1}\n',
      'receipts/e2.jsonl': '{"run": 2}\n',
      'NOTES.md': '# notes\n',
    });
    const result = map(repo);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /ATLAS_MAP_UNASSIGNED_FOLDER {2}A top-level folder holds tracked files in no part, so check fails on each new file there\./);
    assert.match(result.stderr, /what changed: {3}receipts\/: 2 files\n {18}the repository root: 1 file\n/);
    assert.match(result.stderr, /what to do: {5}add the lines below to atlas\/boundaries\.yaml and run atlas map again\n/);
    assert.match(result.stderr, /Lines for atlas\/boundaries\.yaml\na new part, at the end of boundaries:\n {2}- name: receipts\n {4}globs:\n {6}- receipts\/\*\*\n {4}role: data\n/);
    assert.match(result.stderr, / {2}- name: root\n {4}globs:\n {6}- "\*"\n/);
  });

  it('says nothing when every tracked file has a part', () => {
    const repo = repoWith(`${SRC_ONLY}  - name: root
    globs:
      - "*"
    role: config
`, { 'src/route.py': 'def route():\n    return 1\n', 'README.md': '# r\n' });
    const result = map(repo);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stderr, /ATLAS_MAP_UNASSIGNED_FOLDER/);
  });

  it('never names atlas/, which holds the map', () => {
    const repo = repoWith(SRC_ONLY, { 'src/route.py': 'def route():\n    return 1\n', 'data/a.json': '{}\n' });
    const result = map(repo);
    assert.match(result.stderr, /what changed: {3}data\/: 1 file\n {2}what to do/);
    assert.doesNotMatch(result.stderr, /^\s+atlas\/: /m);
    assert.doesNotMatch(result.stderr, /name: atlas\n/);
  });
});
