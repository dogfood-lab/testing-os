import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/hand-deploys: Pages runs vite build in apps/cockpit from its
// working directory, and vite build apps/panel with a --config of its own;
// CI builds the image from the root Dockerfile and nothing pushes it; a
// Hugging Face Space (spaces/live, app.py beside a README whose front matter
// names an sdk) and a Docker MCP Catalog entry (catalog/server.yaml) go out
// by hand.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/hand-deploys');
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
  const root = mkdtempSync(join(tmpdir(), 'atlas-hand-deploys-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'hand-deploys']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('vite build', () => {
  it("runs the app's config and its src/, from the directory it is run in or the root it is handed", () => {
    const pages = structure.doors.find((door) => door.file === '.github/workflows/pages.yml');
    assert.deepEqual(pages.runs.map((run) => run.path).sort(), [
      'apps/cockpit/src/',
      'apps/cockpit/vite.config.ts',
      'apps/panel/src/',
      'apps/panel/vite.panel.config.ts',
    ]);
  });
});

describe('what ships from outside the workflows', () => {
  it('names an image no workflow pushes, a Hugging Face Space and a catalog entry', () => {
    assert.ok(section('## What this map cannot see').includes(
      '- There is a Dockerfile that a workflow builds and none pushes, a Hugging Face Space under spaces/live/ and a Docker MCP Catalog entry at catalog/server.yaml; what ships from them goes from outside this repository, and is not on this page.',
    ), section('## What this map cannot see').join('\n'));
  });
});
