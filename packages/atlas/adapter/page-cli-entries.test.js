import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/cli-entry: @acme/tool exports dist/cli.js, the file its
// acme bin is, which parses process.argv when it loads; a private member's
// acme-server bin is copied into the tool's dist by scripts/pack.mjs, and a
// private member's acme-helper bin nothing bundles. fixtures/atlas/
// cli-entry-main: @acme/runner's main file calls main() as it loads.
// fixtures/atlas/cli-entry-library: @acme/lib's entry is its acme-lib bin
// too, but calls main() only behind a main guard, so importing it runs
// nothing.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const roots = [];
const mapped = {};

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function map(name) {
  const root = mkdtempSync(join(tmpdir(), `atlas-${name}-`));
  roots.push(root);
  cpSync(join(FIXTURES, name), root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', name]);
  const run = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return {
    structure: JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8')),
    markdown: readFileSync(join(root, 'atlas', 'README.md'), 'utf8'),
  };
}

function section(markdown, heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

before(() => {
  mapped.bin = map('cli-entry');
  mapped.main = map('cli-entry-main');
  mapped.library = map('cli-entry-library');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a package whose entry is a command', () => {
  it('is said to run the command, not to be a library people import', () => {
    const lines = section(mapped.bin.markdown, '## What this is');
    assert.ok(lines.some((line) => line.endsWith('It publishes to npm. People run acme.')), lines.join('\n'));
    assert.ok(section(mapped.bin.markdown, '## What comes in').some((line) => line.endsWith("**@acme/tool** (the package's entry, which runs the command acme; it is not a library). Loads src/cli.ts.")));
    const main = section(mapped.main.markdown, '## What this is');
    assert.equal(main.some((line) => line.includes('People import')), false, main.join('\n'));
    assert.ok(section(mapped.main.markdown, '## What comes in').some((line) => line.endsWith("**@acme/runner** (the package's entry, which runs a program as it loads; it is not a library). Loads src/index.js.")));
  });

  it('stays a library when its entry runs the command only as the program', () => {
    const lines = section(mapped.library.markdown, '## What this is');
    assert.ok(lines.some((line) => line.endsWith('People run acme-lib. People import @acme/lib.')), lines.join('\n'));
    assert.equal(mapped.library.structure.doors.find((door) => door.name === '@acme/lib').runsCommand, undefined);
  });

  it('records what the entry runs on the door', () => {
    assert.equal(mapped.bin.structure.doors.find((door) => door.name === '@acme/tool').runsCommand, 'acme');
    assert.equal(mapped.main.structure.doors.find((door) => door.name === '@acme/runner').runsCommand, true);
  });
});

describe("a private member's command", () => {
  it('is a command bundled into the package that bundles it', () => {
    const door = mapped.bin.structure.doors.find((item) => item.name === 'acme-server');
    assert.deepEqual(door.bundledInto, ['@acme/tool']);
    assert.ok(section(mapped.bin.markdown, '## What comes in').some((line) => line.endsWith('**acme-server** (a command bundled into @acme/tool). Runs packages/server/src/server.ts.')));
  });

  it('is no door when nothing bundles it', () => {
    assert.equal(mapped.bin.structure.doors.some((item) => item.name === 'acme-helper'), false);
  });
});
