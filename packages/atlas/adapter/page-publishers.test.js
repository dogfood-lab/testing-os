import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/publishers: Release publishes two packages through a
// for loop over literal directories, one door uploads to the Hugging Face
// Hub with huggingface_hub in a Python heredoc and another with
// huggingface-cli upload, one creates a Zenodo deposit and publishes it with
// curl, another only creates a draft, and Notes only names both in a comment
// and an echo.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/publishers');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function door(name) {
  return structure.doors.find((item) => item.name === name);
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-publishers-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'publishers']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('what a door publishes', () => {
  it('names each package a loop over literal directories publishes', () => {
    assert.deepEqual(door('Release').sends.packages, [
      { dir: 'packages/one', name: '@acme/one', registry: 'npm' },
      { dir: 'packages/two', name: '@acme/two', registry: 'npm' },
    ]);
  });

  it('reads an upload to the Hugging Face Hub and a Zenodo deposit as publishes', () => {
    assert.deepEqual(door('Push dataset to Hugging Face').sends.publishesTo, ['huggingface']);
    assert.deepEqual(door('Push model').sends.publishesTo, ['huggingface']);
    assert.deepEqual(door('Zenodo deposit').sends.publishesTo, ['zenodo']);
    assert.deepEqual(door('Zenodo draft').sends.publishesTo, []);
    assert.deepEqual(door('Notes').sends.publishesTo, []);
  });

  it('says so on the page', () => {
    assert.ok(section('## What this is').some((line) => line.includes('It publishes to the Hugging Face Hub, @acme/one (packages/one) and @acme/two (packages/two) to npm, and a record on Zenodo.')), section('## What this is').join('\n'));
  });
});
