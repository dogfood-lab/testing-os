import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/line-endings, committed twice: once from LF files with
// core.autocrlf false, and once from the same files rewritten with CRLF and
// added with core.autocrlf true, as a Windows checkout holds them. Git stores
// the same tree both times, so the two commits are one commit. Its own
// .gitattributes keeps data/raw.bin raw (-text) and makes data/table.dat text
// although it holds a NUL byte.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/line-endings');
const DATES = { GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
const roots = [];
const mapped = {};

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...DATES } });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function checkout(crlf) {
  const root = mkdtempSync(join(tmpdir(), `atlas-line-endings-${crlf ? 'crlf' : 'lf'}-`));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  if (crlf) {
    for (const path of files(root)) {
      if (relative(root, path).replaceAll('\\', '/') === 'data/raw.bin') continue;
      writeFileSync(path, readFileSync(path, 'latin1').replaceAll('\n', '\r\n'), 'latin1');
    }
  }
  git(root, ['init', '-q']);
  git(root, ['config', 'core.autocrlf', crlf ? 'true' : 'false']);
  git(root, ['config', 'core.safecrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'line-endings']);
  const run = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return {
    root,
    commit: git(root, ['rev-parse', 'HEAD']),
    structure: readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'),
    app: readFileSync(join(root, 'src', 'app.mjs'), 'latin1'),
  };
}

before(() => {
  mapped.lf = checkout(false);
  mapped.crlf = checkout(true);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a checkout with CRLF endings', () => {
  it('is the same commit as one with LF endings, and holds CRLF on disk', () => {
    assert.equal(mapped.crlf.commit, mapped.lf.commit);
    assert.ok(mapped.crlf.app.includes('\r\n'));
    assert.equal(mapped.lf.app.includes('\r'), false);
  });

  it('maps to the same structure, byte for byte', () => {
    assert.equal(mapped.crlf.structure, mapped.lf.structure);
  });

  it('hashes a text file as git stores it, and a -text file as it is', () => {
    const structure = JSON.parse(mapped.lf.structure);
    const hash = (path) => structure.boundaries.flatMap((boundary) => boundary.files).find((file) => file.path === path)?.hash;
    const sha = (text) => createHash('sha256').update(Buffer.from(text, 'latin1')).digest('hex');
    assert.equal(hash('data/raw.bin'), sha('a\r\nb\r\n'));
    assert.equal(hash('data/table.dat'), sha('x\u0000y\nz\n'));
  });
});
