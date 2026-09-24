import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/bundled-builds: six commands whose bins are a bundler's
// output, never tracked and with no tsconfig to trace them through: esbuild
// on the command line, esbuild's API with literal joins and with a root read
// at run time (the package the script is run for), tsup, rollup -i and
// vite build --ssr. Each bin runs the entry its build names, and tool's cli
// imports server's bundle by its dist path.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/bundled-builds');
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
  const root = mkdtempSync(join(tmpdir(), 'atlas-bundled-builds-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'bundled-builds']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("a bundler's output", () => {
  it('runs the entry the build names', () => {
    assert.deepEqual(
      ['bundled-launch', 'bundled-literal', 'bundled-roll', 'bundled-server', 'bundled-ssr', 'bundled-tool'].map((name) => [name, door(name)?.runs.map((run) => run.path), door(name)?.unplaced ?? null]),
      [
        ['bundled-launch', ['packages/launcher/src/cli.ts'], null],
        ['bundled-literal', ['packages/literal/src/main.ts'], null],
        ['bundled-roll', ['packages/roll/src/index.ts'], null],
        ['bundled-server', ['packages/server/src/server.ts'], null],
        ['bundled-ssr', ['packages/ssr/src/entry.ts'], null],
        ['bundled-tool', ['packages/tool/src/cli.ts'], null],
      ],
    );
  });

  it('reads an import of a bundle as an import of its entry', () => {
    assert.deepEqual(structure.edges, [{ from: 'tool', kind: 'file', to: 'server' }]);
  });

  it('never says the source cannot be placed', () => {
    assert.equal(markdown.includes('built from a source this map cannot place'), false);
    assert.ok(section('## What comes in').includes('2. **bundled-launch** (a command people run). Runs packages/launcher/src/cli.ts.'));
  });
});
