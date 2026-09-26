import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { git, mappedRepository, modernMeta, startServer } from './test-client.js';

/**
 * atlas_check_change: the tests and doors a change reaches, what it does to
 * the structure, and whether the map must be regenerated, checked against
 * what atlas check itself says of the same tree; "a full refresh is needed"
 * and nothing else for a change a scoped reading cannot settle; and the time
 * it takes on 20 changed files of this repository.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE = resolve(REPO_ROOT, 'fixtures/atlas/sidecar-reach');
const scratch = [];

after(() => {
  while (scratch.length > 0) rmSync(scratch.pop(), { recursive: true, force: true });
});

function fresh() {
  const root = mappedRepository(FIXTURE, { together: ['lib/core.js', 'lib/other.js'], prefix: 'atlas-check-change-' });
  scratch.push(root);
  return root;
}

async function check(root, args = {}) {
  const server = startServer({ cwd: root });
  const response = await server.request('tools/call', { name: 'atlas_check_change', arguments: args, _meta: modernMeta() });
  await server.close();
  assert.ok(response.result, JSON.stringify(response));
  assert.equal(response.result.isError, undefined, JSON.stringify(response.result.structuredContent));
  return response.result;
}

function atlasCheck(root) {
  const result = spawnSync(process.execPath, [CLI, 'check'], { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout };
}

function items(answer, fact) {
  return answer.facts.filter((entry) => entry.fact === fact).flatMap((entry) => entry.items);
}

describe('a change the scoped reading settles', () => {
  it('names a new import between parts and a file in no part, and says the map must be regenerated, as atlas check does', async () => {
    const root = fresh();
    appendFileSync(join(root, 'tools', 'report.js'), "import { label } from '../lib/other.js';\nexport const labelled = label;\n");
    mkdirSync(join(root, 'misc'));
    writeFileSync(join(root, 'misc', 'stray.js'), 'export const stray = 1;\n');
    git(root, ['add', 'misc/stray.js']);
    const { structuredContent } = await check(root);
    const { answer } = structuredContent;
    assert.deepEqual(answer.changed.map((entry) => [entry.path, entry.status]), [['misc/stray.js', 'added'], ['tools/report.js', 'modified']]);
    assert.deepEqual(items(answer, 'partImportsAdded'), [{ from: 'tools', to: 'lib' }]);
    assert.deepEqual(items(answer, 'importsAdded'), [{ path: 'tools/report.js', imports: 'lib/other.js' }]);
    assert.deepEqual(items(answer, 'inNoPart'), ['misc/stray.js']);
    assert.equal(answer.verdict.fullRefresh.needed, false);
    assert.equal(answer.verdict.regenerate.needed, true);
    const checked = atlasCheck(root);
    assert.equal(checked.status, 1, 'atlas check fails on the same tree');
    assert.match(checked.stdout, /^ATLAS_STRUCTURE_DRIFT /m);
    assert.ok(answer.verdict.regenerate.because.some((reason) => reason.includes('ATLAS_STRUCTURE_DRIFT')));
  });

  it('says a change that keeps the structure passes atlas check, and names the tests and doors it reaches', async () => {
    const root = fresh();
    appendFileSync(join(root, 'lib', 'core.js'), 'export const version = 2;\n');
    const { structuredContent, content } = await check(root);
    const { answer } = structuredContent;
    assert.equal(answer.verdict.regenerate.needed, false);
    assert.equal(atlasCheck(root).status, 0, 'atlas check passes on the same tree');
    assert.deepEqual(items(answer, 'tests'), ['app/main.test.js']);
    assert.deepEqual(items(answer, 'reachedThrough'), [{ door: 'CI', through: 'app/main.js' }]);
    assert.deepEqual(items(answer, 'partImportsAdded'), []);
    assert.match(content[0].text, /^Atlas: atlas check passes on this change as it stands; regenerating the map keeps the hashes of the changed files current\.$/m);
  });

  it('finds a writer or reader gained, read from the file as it is and as the map read it', async () => {
    const root = fresh();
    appendFileSync(join(root, 'app', 'main.js'), "import { readFileSync } from 'node:fs';\nexport const state = () => readFileSync('data/state.json', 'utf8');\n");
    const { structuredContent } = await check(root);
    const added = structuredContent.answer.facts.filter((entry) => entry.fact === 'readsAdded');
    assert.deepEqual(added.map((entry) => [entry.basis, entry.source, entry.items]), [['parsed', 're-read', [{ path: 'app/main.js', place: 'data/state.json' }]]]);
    assert.equal(structuredContent.answer.facts.some((entry) => entry.fact === 'writesAdded'), false, 'what did not change is not reported as a change');
  });

  it('takes the files given, changed or not, and follows them to their tests and doors', async () => {
    const root = fresh();
    const { structuredContent } = await check(root, { files: ['lib/core.js'] });
    const { answer } = structuredContent;
    assert.deepEqual(answer.question, { files: ['lib/core.js'], from: 'given' });
    assert.deepEqual(answer.changed, [{ path: 'lib/core.js', status: 'unchanged', committed: false, uncommitted: false, part: 'lib' }]);
    assert.deepEqual(items(answer, 'tests'), ['app/main.test.js']);
    assert.equal(answer.verdict.regenerate.needed, false);
  });
});

describe('a change the scoped reading cannot settle', () => {
  const cases = [
    ['a changed manifest', (root) => appendFileSync(join(root, 'package.json'), '\n'), 'package.json', 'a manifest'],
    ['a changed workflow', (root) => appendFileSync(join(root, '.github', 'workflows', 'ci.yml'), '# note\n'), '.github/workflows/ci.yml', 'a workflow'],
    ['a changed boundary file', (root) => appendFileSync(join(root, 'atlas', 'boundaries.yaml'), '# note\n'), 'atlas/boundaries.yaml', 'the boundary file'],
    ['a deleted file others import', (root) => rmSync(join(root, 'lib', 'core.js')), 'lib/core.js', 'a deleted file'],
    ['a configuration file the engine reads', (root) => writeFileSync(join(root, 'tsconfig.json'), '{}\n'), 'tsconfig.json', 'a configuration file the engine reads'],
  ];
  for (const [name, change, path, why] of cases) {
    it(`says a full refresh is needed for ${name}, and answers nothing else`, async () => {
      const root = fresh();
      change(root);
      appendFileSync(join(root, 'lib', 'other.js'), 'export const also = 1;\n');
      const { structuredContent, content } = await check(root);
      const { answer } = structuredContent;
      assert.equal(answer.verdict.fullRefresh.needed, true);
      assert.deepEqual(answer.verdict.fullRefresh.because, [{ path, why }]);
      assert.deepEqual(answer.facts, [], 'no partial answer passed off as whole');
      assert.match(content[0].text, /^Atlas: a full refresh is needed to answer for this change: /m);
    });
  }
});

describe('the time atlas_check_change takes on 20 changed files of this repository', () => {
  it('is measured and reported', async (t) => {
    const clone = mkdtempSync(join(tmpdir(), 'atlas-check-speed-'));
    scratch.push(clone);
    git(tmpdir(), ['clone', '-q', '--no-hardlinks', REPO_ROOT, clone]);
    const structure = JSON.parse(readFileSync(join(clone, 'atlas', 'structure.json'), 'utf8'));
    if (spawnSync('git', ['cat-file', '-e', `${structure.generatedFrom.commit}^{commit}`], { cwd: clone }).status !== 0) {
      t.skip('this clone does not hold the commit the committed map was made from, so the sidecar halts, as it must');
      return;
    }
    // Twenty source files the map holds, spread over the packages, each
    // changed by a line.
    const candidates = structure.boundaries.filter((boundary) => boundary.role === 'code')
      .flatMap((boundary) => boundary.files.map((file) => file.path))
      .filter((path) => path.startsWith('packages/') && /\.(js|mjs|ts)$/.test(path) && !/\.test\.|\/fixtures\//.test(path)).sort();
    const step = Math.floor(candidates.length / 20);
    const files = Array.from({ length: 20 }, (_, i) => candidates[i * step]);
    for (const path of files) appendFileSync(join(clone, path), '\n// changed for the timing\n');
    const started = Date.now();
    const result = await check(clone, { files });
    const elapsed = Date.now() - started;
    t.diagnostic(`atlas_check_change on 20 changed files of this repository: ${elapsed} ms, server start and exit included`);
    assert.equal(result.structuredContent.answer.changed.length, 20);
    assert.equal(result.structuredContent.answer.verdict.fullRefresh.needed, false);
  });
});
