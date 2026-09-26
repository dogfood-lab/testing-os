import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { modernMeta, startServer } from './test-client.js';

/**
 * What every answer carries: the provenance in one line and as fields, a
 * basis on every fact with the classes never merged, what Atlas cannot see
 * for the question, a map checked before it is answered from, and Atlas's
 * own voice. The fixture holds one of each basis: a text-found reader, a
 * weak writer, paths built at run time, an unresolved import, a write that
 * leaves the repository, a door, imports and files that change together.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-basis');
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const BASES = ['parsed', 'declared', 'text', 'weak', 'history', 'unresolved', 'outside'];
const scratch = [];
let repo;
let mapCommit;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function commitAll(cwd, message) {
  git(cwd, ['add', '-A']);
  git(cwd, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', message]);
}

// The fixture as a repository whose two lib files changed together often
// enough to be a pair, mapped, with the map committed.
function mappedRepo() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-envelope-'));
  scratch.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['config', 'core.autocrlf', 'false']);
  commitAll(root, 'fixture');
  for (let i = 1; i <= 6; i += 1) {
    appendFileSync(join(root, 'lib', 'store.js'), `// change ${i}\n`);
    appendFileSync(join(root, 'lib', 'scratch.js'), `// change ${i}\n`);
    commitAll(root, `change ${i}`);
  }
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  commitAll(root, 'map');
  return root;
}

async function explain(cwd, path) {
  const server = startServer({ cwd });
  const response = await server.request('tools/call', { name: 'atlas_explain', arguments: { path }, _meta: modernMeta() });
  await server.close();
  assert.ok(response.result, JSON.stringify(response));
  return response.result;
}

before(() => {
  repo = mappedRepo();
  mapCommit = JSON.parse(readFileSync(join(repo, 'atlas', 'structure.json'), 'utf8')).generatedFrom.commit;
});

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

function factGroups(result, fact, basis) {
  return result.structuredContent.answer.facts.filter((entry) => entry.fact === fact && (basis == null || entry.basis === basis));
}

describe('a basis on every fact', () => {
  it('shows each of the seven bases across the answers, and no fact without one', async () => {
    const answers = await Promise.all(['lib/store.js', 'lib/scratch.js', '.gitignore', 'data/latest.json'].map((path) => explain(repo, path)));
    const seen = new Set();
    for (const result of answers) {
      assert.equal(result.isError, undefined, JSON.stringify(result.structuredContent));
      for (const entry of result.structuredContent.answer.facts) {
        assert.ok(BASES.includes(entry.basis), JSON.stringify(entry));
        assert.ok(['parsed', 'declared', 'text', 'weak', 'history'].includes(entry.basis), `a fact is known, not unseen: ${JSON.stringify(entry)}`);
        assert.equal(entry.total, entry.items.length);
        assert.equal(entry.complete, true);
        seen.add(entry.basis);
      }
      for (const entry of result.structuredContent.answer.cannotSee) {
        assert.ok(['unresolved', 'outside'].includes(entry.basis), JSON.stringify(entry));
        seen.add(entry.basis);
      }
    }
    assert.deepEqual([...seen].sort(), [...BASES].sort());
  });

  it('states what a file is known to do, each list one basis', async () => {
    const store = await explain(repo, 'lib/store.js');
    assert.deepEqual(factGroups(store, 'runBy', 'declared').map((entry) => entry.items), [['Save']]);
    assert.deepEqual(factGroups(store, 'writes', 'parsed').map((entry) => entry.items), [['data/latest.json']]);
    assert.deepEqual(factGroups(store, 'readersOfWrites', 'text').map((entry) => entry.items), [[{ place: 'data/latest.json', by: 'site/index.html' }]]);
    assert.deepEqual(factGroups(store, 'importedByFiles', 'parsed').map((entry) => [entry.items, entry.tests]), [[['test/store.test.js'], true]]);
    const [history] = factGroups(store, 'changesWith', 'history');
    assert.deepEqual(history.items, [{ either: 6, file: 'lib/scratch.js', shared: 6, strength: 1 }]);
    assert.equal(typeof history.window.since, 'string');
    assert.equal(history.confidence.level, 'low');
  });

  it('marks a guess from a bare file name weak, where the page states nothing', async () => {
    const scratchFile = await explain(repo, 'lib/scratch.js');
    assert.deepEqual(factGroups(scratchFile, 'writes', 'weak').map((entry) => entry.items), [['.gitignore']]);
    const ignored = await explain(repo, '.gitignore');
    assert.deepEqual(factGroups(ignored, 'writtenBy', 'weak').map((entry) => entry.items), [[{ by: 'lib/scratch.js', place: '.gitignore', relation: 'exact' }]]);
    assert.match(ignored.content[0].text, /lib\/scratch\.js may also write it, a guess from a bare file name \(weak\)\./);
  });

  it('lists what Atlas cannot see for the file asked about', async () => {
    const store = await explain(repo, 'lib/store.js');
    const cannot = store.structuredContent.answer.cannotSee;
    assert.deepEqual(cannot.find((entry) => entry.what === 'import'), {
      basis: 'unresolved', what: 'import', grain: 'part', part: 'lib', count: 1,
      named: [{ path: 'lib/store.js', specifier: 'left-pad', why: 'undeclared' }],
    });
    assert.ok(cannot.some((entry) => entry.basis === 'unresolved' && entry.what === 'read' && entry.reason === 'a path built at run time'), JSON.stringify(cannot));
    assert.ok(cannot.some((entry) => entry.basis === 'outside' && entry.what === 'write' && entry.where === 'temporary'), JSON.stringify(cannot));
    const text = store.content[0].text;
    assert.match(text, /^Atlas cannot see where 1 import in lib leads: it does not resolve\.$/m);
    assert.match(text, /^Atlas does not follow 1 write in lib that goes to a temporary directory\.$/m);
  });
});

describe('the provenance', () => {
  it('names the engine, the map and the checkout, in fields and in one line', async () => {
    const result = await explain(repo, 'lib/store.js');
    const { atlas } = result.structuredContent;
    const head = git(repo, ['rev-parse', 'HEAD']);
    assert.equal(atlas.engine, VERSION);
    assert.deepEqual(atlas.map, { snapshot: 'committed', commit: mapCommit, date: atlas.map.date, engine: VERSION, engineAge: 'same' });
    assert.match(atlas.map.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(atlas.checkout.head, head);
    assert.equal(atlas.checkout.rootFrom, 'working directory');
    assert.deepEqual(atlas.checkout.changed, []);
    assert.equal(atlas.line, `Atlas ${VERSION} · map ${mapCommit.slice(0, 7)}, ${atlas.map.date}, made by Atlas ${VERSION} · HEAD ${head.slice(0, 7)}`);
    assert.equal(result.content[0].text.split('\n')[0], atlas.line);
  });

  it('says which files in the answer changed after the map, committed or not', async () => {
    const root = mappedRepo();
    appendFileSync(join(root, 'test', 'store.test.js'), '// committed after the map\n');
    commitAll(root, 'after the map');
    appendFileSync(join(root, 'lib', 'store.js'), '// not committed\n');
    const result = await explain(root, 'lib/store.js');
    assert.deepEqual(result.structuredContent.atlas.checkout.changed, [
      { path: 'lib/store.js', committed: false, uncommitted: true },
      { path: 'test/store.test.js', committed: true, uncommitted: false },
    ]);
    assert.match(result.structuredContent.atlas.line, / · lib\/store\.js changed after the map \(uncommitted\); test\/store\.test\.js changed after the map \(committed\)$/);
  });
});

describe('the map is checked before it is answered from', () => {
  function brokenCopy(write) {
    const root = mappedRepo();
    write(root);
    return root;
  }

  it('halts with the reason when there is no map, and names atlas init', async () => {
    const root = brokenCopy((dir) => rmSync(join(dir, 'atlas', 'structure.json')));
    const result = await explain(root, 'lib/store.js');
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'ATLAS_SIDECAR_NO_MAP');
    assert.match(result.structuredContent.error.whatToDo, /atlas init/);
  });

  it('halts when a map file does not parse', async () => {
    const root = brokenCopy((dir) => writeFileSync(join(dir, 'atlas', 'statistics.json'), 'not json'));
    const result = await explain(root, 'lib/store.js');
    assert.equal(result.structuredContent.error.code, 'ATLAS_SIDECAR_MAP_UNREADABLE');
    assert.deepEqual(result.structuredContent.error.whatChanged, ['the committed map: statistics.json is not valid JSON']);
  });

  it('halts when the structure is not in a format this engine reads', async () => {
    const root = brokenCopy((dir) => writeFileSync(join(dir, 'atlas', 'structure.json'), '{"boundaries": []}\n'));
    const result = await explain(root, 'lib/store.js');
    assert.equal(result.structuredContent.error.code, 'ATLAS_SIDECAR_MAP_FORMAT');
  });

  it("halts when the map names a commit that is not in this checkout's history", async () => {
    const root = brokenCopy((dir) => {
      const path = join(dir, 'atlas', 'structure.json');
      const structure = JSON.parse(readFileSync(path, 'utf8'));
      structure.generatedFrom.commit = 'f'.repeat(40);
      writeFileSync(path, JSON.stringify(structure));
    });
    const result = await explain(root, 'lib/store.js');
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'ATLAS_SIDECAR_MAP_FOREIGN');
    assert.equal(result.structuredContent.atlas.map, undefined, 'a map that failed its check is named nowhere as the one answered from');
  });
});

describe("Atlas's voice", () => {
  it('speaks in the third person, the instrument named, never as I', async () => {
    const result = await explain(repo, 'lib/store.js');
    const [line, ...sentences] = result.content[0].text.split('\n');
    assert.match(line, /^Atlas \d/);
    for (const sentence of sentences) assert.match(sentence, /^Atlas( cannot see| does not follow|:) /, sentence);
    assert.doesNotMatch(result.content[0].text, /\bI\b|\bI'm\b|\bmy\b|\bwe\b/i);
  });
});
