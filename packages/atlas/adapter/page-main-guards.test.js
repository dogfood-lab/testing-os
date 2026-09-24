import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/main-guards: generators whose writes sit behind a main
// guard, in each form the fleet writes one: an if on import.meta.url against
// process.argv[1], a name bound to Boolean(process.argv[1] && resolve(...) ===
// ...) guarding a call that takes a parameter's default, a table of commands
// holding a function nothing else calls, process.argv[1]?.includes(...), a
// main() handing an exported function the library it writes, and Python's
// if __name__ == "__main__". CI only imports their pure functions;
// Regenerate runs two of them.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/main-guards');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function door(file) {
  return structure.doors.find((item) => item.file === `.github/workflows/${file}`);
}

function writer(target) {
  return structure.landings.find((landing) => landing.target === target)?.writers ?? [];
}

function section(heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).trim().split('\n');
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-main-guards-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'main-guards']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a write behind a main guard', () => {
  it('is never credited to a door that only imports the file', () => {
    assert.deepEqual(door('ci.yml').landings, []);
  });

  it('is credited to a door that runs the file', () => {
    assert.deepEqual(door('regenerate.yml').landings, ['data/out.json', 'tools/report.txt']);
  });

  it('keeps each write on the writer, marked as made only by a run of it', () => {
    assert.deepEqual(writer('data/out.json'), [{ by: 'scripts/gen-data.mjs', confidence: 'ast', unless: ['main'] }]);
    assert.deepEqual(writer('corpus/records.json'), [{ by: 'src/corpus.mjs', confidence: 'ast', unless: ['main'] }]);
    assert.deepEqual(writer('tools/runs/state.json'), [{ by: 'tools/fetch.mjs', confidence: 'ast', unless: ['main'] }]);
    assert.deepEqual(writer('data/sft.jsonl'), [{ by: 'tools/format.mjs', confidence: 'ast', unless: ['main'] }]);
    assert.deepEqual(writer('library/index.json'), [{ by: 'scripts/annotate.mjs', confidence: 'ast', unless: ['main'] }]);
    assert.deepEqual(writer('tools/report.txt'), [{ by: 'tools/report.py', confidence: 'ast', unless: ['main'] }]);
  });

  it('says the file writes the place, with no guard a reader would misread', () => {
    assert.deepEqual(section('## Generated, never hand-edited'), [
      '## Generated, never hand-edited',
      '',
      '- **corpus/** is written by src/corpus.mjs.',
      '- **data/** is written by scripts/gen-data.mjs and tools/format.mjs.',
      '- **library/** is written by scripts/annotate.mjs.',
      '- **tools/report.txt** is written by tools/report.py.',
      '- **tools/runs/state.json** is written by tools/fetch.mjs.',
    ]);
  });
});
