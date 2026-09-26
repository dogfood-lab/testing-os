import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/engine-stamp');
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
// Every basis the sidecar reports is read from one of these; an entry with
// none would reach an asker with no word for how it was known.
const CONFIDENCES = new Set(['ast', 'config', 'text', 'weak']);

let root;
let structure;
let page;
let markdown;

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-engine-stamp-'));
  cpSync(FIXTURE, root, { recursive: true });
  git(['init', '-q']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '-A']);
  git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', 'fixture']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  page = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('the engine that made a map is stamped on it', () => {
  it('records the package version in structure.json and page.json', () => {
    assert.equal(structure.engine, VERSION);
    assert.equal(page.engine, VERSION);
  });

  it('names the engine on the page, after the commit', () => {
    const commit = git(['rev-parse', 'HEAD']).slice(0, 7);
    const date = page.generatedAt.slice(0, 10);
    assert.equal(markdown.split('\n')[2], `Mapped at ${date} from commit ${commit} by Atlas ${VERSION}.`);
  });
});

describe('every writer and reader says how it was known', () => {
  it('gives each landing entry and each door reader a known confidence', () => {
    const entries = [
      ...structure.landings.flatMap((landing) => [...landing.writers, ...landing.readers].map((entry) => ({ ...entry, target: landing.target }))),
      ...structure.doors.flatMap((door) => door.readers ?? []),
    ];
    assert.ok(entries.length >= 3, JSON.stringify(entries));
    const missing = entries.filter((entry) => !CONFIDENCES.has(entry.confidence));
    assert.deepEqual(missing, []);
  });

  it('marks what a workflow names and writes by its own shell as stated by that workflow', () => {
    const landing = (target) => structure.landings.find((entry) => entry.target === target);
    assert.deepEqual(landing('CHANGELOG.md').readers, [{ by: '.github/workflows/release.yml', confidence: 'config' }]);
    assert.deepEqual(landing('docs/released.txt').writers, [{ by: '.github/workflows/release.yml', confidence: 'config' }]);
    assert.deepEqual(landing('docs/released.txt').readers, [{ by: '.github/workflows/check.yml', confidence: 'config' }]);
    const release = structure.doors.find((door) => door.name === 'Release');
    assert.deepEqual(release.readers, [{ by: '.github/workflows/check.yml', confidence: 'config', target: 'docs/released.txt' }]);
  });

  it('keeps naming a workflow reader by its path alone on the page', () => {
    // "(from configuration)" is for a configuration file that names a place;
    // a workflow is named by its file, as before the stamp.
    assert.ok(markdown.includes('- **docs/released.txt** is read by .github/workflows/check.yml.'), markdown);
    assert.ok(!markdown.includes('(from configuration)'), markdown);
  });
});
