import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

// fixtures/atlas/start-chain: a pull-request door that runs a test directory
// whose test imports code that imports the manifest and writes data a page
// reads, beside a push-only door that commits that data.
// fixtures/atlas/start-chain-none: a door that hands a page of notes to a
// tool and runs no code.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const roots = [];

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function map(name) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-start-'));
  roots.push(root);
  cpSync(resolve(import.meta.dirname, '../../../fixtures/atlas', name), root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', name]);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  const markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
  const start = markdown.indexOf('## Where to start\n');
  const end = markdown.indexOf('\n## ', start + 1);
  return {
    page: JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')),
    section: markdown.slice(start, end).trim().split('\n'),
  };
}

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('where to start', () => {
  it('follows the pull-request door through files that run, past its test, never a directory or a manifest, and ends in code', () => {
    const { page, section } = map('start-chain');
    // src/store.js is the file that writes data/out.json, which app.js reaches by import.
    assert.deepEqual(page.startHere, ['.github/workflows/ci.yml', 'src/app.js', 'src/store.js', 'data/out.json', 'site/view.js']);
    assert.deepEqual(section, [
      '## Where to start',
      '',
      '.github/workflows/ci.yml → src/app.js → src/store.js → data/out.json → site/view.js',
      '',
      'Read those in order to follow one pull request end to end.',
    ]);
  });

  it('says so when the door runs no code, rather than printing a path', () => {
    const { page, section } = map('start-chain-none');
    assert.deepEqual(page.startHere, []);
    assert.deepEqual(section, [
      '## Where to start',
      '',
      'Render runs no code this map can follow, so there is no path of files to read in order.',
    ]);
  });
});
