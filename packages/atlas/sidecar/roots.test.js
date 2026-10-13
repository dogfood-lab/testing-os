import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { chooseRoot, isNetworkPath, MAX_ROOTS, pathKey, readReposFile, rootsOf } from './roots.js';

// docs/atlas-buildup.spec.md, slice AN: the repositories one sidecar answers
// for are fixed when it starts, compared as real paths, and named by path
// or folder name; anything else is refused. These tests use real
// directories, git repositories and links; the server's own handling of
// them is in repos.test.js.

const WINDOWS = process.platform === 'win32';
const scratchRoots = [];

after(() => {
  while (scratchRoots.length > 0) rmSync(scratchRoots.pop(), { recursive: true, force: true });
});

function scratch(prefix = 'atlas-roots-') {
  const path = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  scratchRoots.push(path);
  return path;
}

function gitRepository(path) {
  mkdirSync(path, { recursive: true });
  const result = spawnSync('git', ['init', '-q', path], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return path;
}

// A tree exported without its history: a directory holding atlas/structure.json.
function exportedTree(path) {
  mkdirSync(join(path, 'atlas'), { recursive: true });
  writeFileSync(join(path, 'atlas', 'structure.json'), '{}\n');
  return path;
}

// A directory link: a junction on Windows, which needs no privilege, and a
// symbolic link elsewhere.
function link(target, path) {
  symlinkSync(target, path, WINDOWS ? 'junction' : 'dir');
  return path;
}

function reposFile(dir, lines, name = 'repos.txt') {
  const path = join(dir, name);
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

describe('a --repos file', () => {
  it('names repositories by absolute path or by a path relative to the file, skipping blanks and comments', () => {
    const ws = scratch();
    const alpha = gitRepository(join(ws, 'alpha'));
    const beta = exportedTree(join(ws, 'beta'));
    mkdirSync(join(ws, 'lists'));
    const file = reposFile(join(ws, 'lists'), ['\uFEFF# the ladder\'s roots', '', alpha, '  ../beta  ']);
    // Read from another directory: relative paths are the file's, not the caller's.
    const read = readReposFile(file, { cwd: scratch() });
    assert.equal(read.ok, true, JSON.stringify(read.error));
    assert.deepEqual(read.roots.map((root) => [root.name, root.real, root.from, root.exported, root.line]), [
      ['alpha', alpha, 'repos file', false, 3],
      ['beta', beta, 'repos file', true, 4],
    ]);
  });

  it('lists every problem it finds, with its line, and starts nothing', () => {
    const ws = scratch();
    const alpha = gitRepository(join(ws, 'alpha'));
    mkdirSync(join(alpha, 'src'));
    mkdirSync(join(ws, 'plain'));
    const file = reposFile(ws, [alpha, join(ws, 'missing'), join(ws, 'plain'), join(alpha, 'src'), 'alpha']);
    const read = readReposFile(file);
    assert.equal(read.ok, false);
    assert.equal(read.error.code, 'ATLAS_SIDECAR_REPOS_FILE');
    assert.deepEqual(read.error.details.map((detail) => detail.split(':')[0]), ['line 2', 'line 3', 'line 4', 'line 5']);
    assert.match(read.error.details[0], /is not a directory$/);
    assert.match(read.error.details[1], /is in no git repository and holds no atlas\/structure\.json$/);
    assert.match(read.error.details[2], /is inside the repository at .*alpha; list the repository's top directory$/);
    assert.match(read.error.details[3], /is the repository line 1 names$/);
  });

  it('refuses one repository listed twice through a link, since the link resolves to it', () => {
    const ws = scratch();
    const alpha = gitRepository(join(ws, 'alpha'));
    const alias = link(alpha, join(ws, 'alias'));
    const read = readReposFile(reposFile(ws, [alpha, alias]));
    assert.equal(read.ok, false);
    assert.deepEqual(read.error.details, [`line 2: ${alias} is the repository line 1 names`]);
  });

  it('refuses a file that names no repository, one it cannot read, and one over the limit', () => {
    const ws = scratch();
    const empty = reposFile(ws, ['# nothing yet']);
    assert.deepEqual(readReposFile(empty).error.details, [`${empty} names no repository`]);
    assert.match(readReposFile(join(ws, 'absent.txt')).error.details[0], /cannot be read: ENOENT$/);
    const many = Array.from({ length: MAX_ROOTS + 1 }, (_, i) => exportedTree(join(ws, `tree-${i}`)));
    const over = readReposFile(reposFile(ws, many, 'many.txt'));
    assert.equal(over.ok, false);
    assert.match(over.error.details[0], new RegExp(`names ${MAX_ROOTS + 1} repositories, and one server answers for at most ${MAX_ROOTS}$`));
  });

  it('refuses a network path on Windows before reading anything from it', () => {
    const ws = scratch();
    const file = reposFile(ws, ['\\\\server\\share\\repo', '//server/share/repo']);
    const read = readReposFile(file, { platform: 'win32' });
    assert.equal(read.ok, false);
    assert.deepEqual(read.error.details, [
      'line 1: \\\\server\\share\\repo is a network path, and a root must be on this machine',
      'line 2: //server/share/repo is a network path, and a root must be on this machine',
    ]);
  });
});

describe('network paths', () => {
  it('are the \\\\ and // forms, device paths included, on Windows only', () => {
    for (const path of ['\\\\server\\share', '//server/share', '\\\\?\\C:\\repo', '\\\\.\\C:\\repo', '\\\\?\\UNC\\server\\share']) {
      assert.equal(isNetworkPath(path, 'win32'), true, path);
    }
    for (const path of ['C:\\repo', 'C:/repo', '\\repo']) assert.equal(isNetworkPath(path, 'win32'), false, path);
    assert.equal(isNetworkPath('//server/share', 'linux'), false);
  });

  it('compare without case on Windows and exactly elsewhere', () => {
    assert.equal(pathKey('E:\\AI\\Repo', 'win32'), pathKey('e:\\ai\\repo', 'win32'));
    assert.notEqual(pathKey('/ws/Repo', 'linux'), pathKey('/ws/repo', 'linux'));
  });
});

describe('the repository a call answers for', () => {
  function listed(...dirs) {
    const ws = dirname(dirs[0]);
    const read = readReposFile(reposFile(ws, dirs, `list-${dirs.length}-${Date.now()}.txt`));
    assert.equal(read.ok, true, JSON.stringify(read.error));
    return read.roots;
  }

  it('is a root named by its absolute path or its folder name', () => {
    const ws = scratch();
    const alpha = gitRepository(join(ws, 'alpha'));
    const beta = gitRepository(join(ws, 'beta'));
    const repos = listed(alpha, beta);
    const context = { cwd: alpha, repos };
    assert.equal(chooseRoot(context, beta).repo.real, beta);
    assert.equal(chooseRoot(context, 'beta').repo.real, beta);
    assert.equal(chooseRoot(context, undefined).repo.real, alpha, 'with no repo, the directory it was started in, which the list names');
  });

  it('is the same root through a link, and a link out of a root is outside it', () => {
    const ws = scratch();
    const alpha = gitRepository(join(ws, 'alpha'));
    const outside = gitRepository(join(scratch('atlas-roots-outside-'), 'outside'));
    const repos = listed(alpha);
    const viaLink = link(alpha, join(ws, 'via-link'));
    assert.equal(chooseRoot({ cwd: ws, repos }, viaLink).repo.real, alpha);
    const escape = link(outside, join(alpha, 'escape'));
    const refused = chooseRoot({ cwd: ws, repos }, escape);
    assert.equal(refused.error.code, 'ATLAS_SIDECAR_REPO_NOT_ALLOWED');
    assert.match(refused.error.details[0], /is not one of the roots fixed when atlas mcp started$/);
  });

  it('is the same root with its drive letter in the other case, on Windows', { skip: !WINDOWS && 'drive letters are Windows paths' }, () => {
    const ws = scratch();
    const alpha = gitRepository(join(ws, 'alpha'));
    const repos = listed(alpha);
    const flipped = alpha[0] === alpha[0].toUpperCase() ? alpha[0].toLowerCase() + alpha.slice(1) : alpha[0].toUpperCase() + alpha.slice(1);
    assert.notEqual(flipped, alpha);
    assert.equal(chooseRoot({ cwd: ws, repos }, flipped).repo.real, alpha);
    assert.equal(chooseRoot({ cwd: ws, repos }, alpha.toUpperCase()).repo.real, alpha);
  });

  it('is refused for a network path before the path is touched', () => {
    const ws = scratch();
    const repos = listed(gitRepository(join(ws, 'alpha')));
    for (const path of ['\\\\localhost\\C$\\Windows', '//localhost/C$/Windows']) {
      const refused = chooseRoot({ cwd: ws, repos }, path, { platform: 'win32' });
      assert.equal(refused.error.code, 'ATLAS_SIDECAR_REPO_NOT_ALLOWED', path);
      assert.match(refused.error.details[0], /is a network path, and a root is on this machine$/);
    }
  });

  it('is refused for anything else: another repository, a subdirectory, a relative path, a missing one, an unknown name', () => {
    const ws = scratch();
    const alpha = gitRepository(join(ws, 'alpha'));
    const other = gitRepository(join(ws, 'other'));
    mkdirSync(join(alpha, 'src'));
    const repos = listed(alpha);
    const context = { cwd: alpha, repos };
    for (const [repo, said] of [
      [other, /is not one of the roots fixed when atlas mcp started$/],
      [join(alpha, 'src'), /is not one of the roots fixed when atlas mcp started$/],
      ['../other', /is a relative path$/],
      ['..', /is a relative path$/],
      [join(ws, 'missing'), /does not exist$/],
      ['other', /^no root is named other$/],
    ]) {
      const refused = chooseRoot(context, repo);
      assert.equal(refused.error.code, 'ATLAS_SIDECAR_REPO_NOT_ALLOWED', repo);
      assert.match(refused.error.details[0], said, repo);
      assert.equal(refused.error.details[1], `the roots are alpha (${alpha})`);
    }
  });

  it('is refused by a name two roots share, with both listed', () => {
    const one = gitRepository(join(scratch(), 'twin'));
    const two = gitRepository(join(scratch(), 'twin'));
    const read = readReposFile(reposFile(scratch(), [one, two]));
    assert.equal(read.ok, true, 'two repositories with one folder name are both roots');
    const refused = chooseRoot({ cwd: one, repos: read.roots }, 'twin');
    assert.equal(refused.error.code, 'ATLAS_SIDECAR_REPO_AMBIGUOUS');
    assert.deepEqual(refused.error.details, [`2 roots are named twin: ${one}, ${two}`]);
    assert.equal(chooseRoot({ cwd: one, repos: read.roots }, two).repo.real, two, 'the path still names one');
  });

  it('with a --repos list, is refused when the call names none and the list leaves out where it started', () => {
    const ws = scratch();
    const repos = listed(gitRepository(join(ws, 'alpha')));
    const refused = chooseRoot({ cwd: gitRepository(join(ws, 'unlisted')), repos }, undefined);
    assert.equal(refused.error.code, 'ATLAS_SIDECAR_REPO_NOT_ALLOWED');
    assert.match(refused.error.details[0], /^the directory atlas mcp was started in is not in a repository the --repos file names/);
  });
});

describe('the roots without a --repos file', () => {
  it('are the client\'s roots at their repositories\' tops, then the working directory\'s, the first answering by default', () => {
    const ws = scratch();
    const alpha = gitRepository(join(ws, 'alpha'));
    const beta = gitRepository(join(ws, 'beta'));
    mkdirSync(join(beta, 'deep', 'er'), { recursive: true });
    const roots = rootsOf({ cwd: alpha, roots: [join(beta, 'deep', 'er'), beta] });
    assert.deepEqual(roots.map((root) => [root.name, root.from]), [['beta', 'client root'], ['alpha', 'working directory']]);
    assert.equal(chooseRoot({ cwd: alpha, roots: [beta] }, undefined).repo.real, beta);
    assert.equal(chooseRoot({ cwd: alpha, roots: [beta] }, 'alpha').repo.real, alpha);
    assert.equal(chooseRoot({ cwd: alpha, roots: [beta] }, gitRepository(join(ws, 'gamma'))).error.code, 'ATLAS_SIDECAR_REPO_NOT_ALLOWED');
  });

  it('put a tree exported without its history after every git repository, as the default was chosen before', () => {
    const ws = scratch();
    const tree = exportedTree(join(ws, 'tree'));
    const alpha = gitRepository(join(ws, 'alpha'));
    assert.deepEqual(rootsOf({ cwd: alpha, roots: [tree] }).map((root) => root.name), ['alpha', 'tree']);
  });

  it('say there is no repository when there is none', () => {
    const refused = chooseRoot({ cwd: scratch(), roots: [] }, undefined);
    assert.equal(refused.error.code, 'ATLAS_SIDECAR_NOT_A_REPOSITORY');
  });
});
