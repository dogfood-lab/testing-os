import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

// docs/atlas-buildup.spec.md, AM-5. A part with no writer the map names was
// said to be written by people. For data that claims more than the map
// knows: interlock's harness writes receipts/ through paths built at run
// time, and its page said "People write receipts/". A data part is now said
// to be written by no code the map names; config, docs and site keep
// "People write".

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function git(cwd, args) {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function handAuthored(boundaries, files) {
  const repo = mkdtempSync(join(tmpdir(), 'atlas-authored-data-'));
  roots.push(repo);
  for (const [path, text] of Object.entries({ ...files, 'atlas/boundaries.yaml': boundaries })) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git(repo, ['init', '--quiet']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'repo']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: repo, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  const markdown = readFileSync(join(repo, 'atlas', 'README.md'), 'utf8');
  const start = markdown.indexOf('## Hand-authored\n');
  assert.ok(start >= 0, markdown);
  const next = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

const PARTS = `boundaries:
  - name: docs
    globs:
      - docs/**
    role: docs
  - name: receipts
    globs:
      - receipts/**
    role: data
  - name: root
    globs:
      - "*"
    role: docs
  - name: scripts
    globs:
      - scripts/**
    role: code
`;

const FILES = {
  'docs/guide.md': '# Guide\n',
  'receipts/e5-2026-10-13.jsonl': '{"run": 1}\n',
  'README.md': '# Harness\n',
  'scripts/noop.mjs': 'export const noop = () => {};\n',
};

describe('what Hand-authored says of a data part', () => {
  it('says no code writes the data, and keeps People write for docs', () => {
    assert.deepEqual(handAuthored(PARTS, FILES), [
      '## Hand-authored',
      '',
      'People write docs/ and the repository root. Nothing in this repository writes to them. The data in receipts/ is written by no code in this repository.',
    ]);
  });

  it('keeps the caveat for writes whose paths are built at run time', () => {
    assert.deepEqual(handAuthored(PARTS, {
      ...FILES,
      'scripts/translate.mjs': [
        "import { readFileSync, writeFileSync } from 'node:fs';",
        "import { dirname, join } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        '',
        "const root = join(dirname(fileURLToPath(import.meta.url)), '..');",
        "const source = readFileSync(join(root, 'README.md'), 'utf8');",
        'for (const lang of process.argv.slice(2)) writeFileSync(join(root, `README.${lang}.md`), source);',
        '',
      ].join('\n'),
    }), [
      '## Hand-authored',
      '',
      'People write docs/ and the repository root. The data in receipts/ is written by no code this map names; 1 write with a path built at run time may land here.',
    ]);
  });

  it('speaks of the data alone when no config, docs or site part is left to people', () => {
    assert.deepEqual(handAuthored(`boundaries:
  - name: receipts
    globs:
      - receipts/**
    role: data
  - name: scripts
    globs:
      - scripts/**
    role: code
`, { 'receipts/e1.jsonl': '{"run": 1}\n', 'receipts/e2.jsonl': '{"run": 2}\n', 'scripts/noop.mjs': 'export const noop = () => {};\n' }), [
      '## Hand-authored',
      '',
      'The data in receipts/ is written by no code in this repository.',
    ]);
  });
});
