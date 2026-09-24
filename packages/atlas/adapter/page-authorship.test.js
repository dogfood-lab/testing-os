import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/authorship, committed on by people and by a bot: people make
// four of the five commits to logos/, which a workflow also writes, and the
// bot alone adds every file in records/.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/authorship');
const PERSON = ['-c', 'user.name=Ada Maker', '-c', 'user.email=ada@example.com'];
const BOT = ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];
const roots = [];
let markdown;
let page;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function commit(root, who, path, text, message) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
  git(root, ['add', '-A']);
  git(root, [...who, 'commit', '-m', message]);
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-authorship-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, [...PERSON, 'commit', '-m', 'authorship']);
  for (let i = 1; i <= 3; i += 1) commit(root, PERSON, 'logos/b.svg', `<svg id="${i}"/>\n`, `redraw b ${i}`);
  commit(root, BOT, 'logos/a.svg', '<svg id="synced"/>\n', 'sync logos');
  commit(root, BOT, 'records/r1.json', '{}\n', 'record 1');
  commit(root, BOT, 'records/r2.json', '{}\n', 'record 2');
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
  page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function section(heading) {
  const start = markdown.indexOf(`## ${heading}\n`);
  const next = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, next === -1 ? markdown.length : next);
}

describe('who commits to a place', () => {
  it('keeps a place people mostly commit to out of Generated, and says a writer writes it too', () => {
    assert.ok(!page.generated.some((item) => item.place === 'logos/'), JSON.stringify(page.generated));
    assert.match(section('Hand-authored'), /- \*\*logos\/\*\* is written by \.github\/workflows\/sync\.yml and scripts\/sync\.mjs, and by people: 4 of its 5 commits in the window are theirs\./);
  });

  it('calls a part whose every file one bot added written by that bot, not hand-authored', () => {
    assert.match(section('Generated, never hand-edited'), /- \*\*records\/\*\* is written by github-actions\[bot\], which added every file in it\./);
    assert.doesNotMatch(section('Hand-authored'), /records\//);
  });
});
