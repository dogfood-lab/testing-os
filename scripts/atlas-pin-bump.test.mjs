import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { makeRepo } from '../packages/atlas/core/fixture-repo.js';
import { main } from './atlas-pin-bump.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE = resolve(HERE, '../fixtures/atlas-pin-bump/basic');
const CLI = resolve(HERE, '../packages/atlas/cli.js');
const TARGET = JSON.parse(readFileSync(resolve(HERE, '../package.json'), 'utf8')).version;
const WORKFLOW = '.github/workflows/ci.yml';
const PIN_LINE = 28;
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function temporary(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

function gitAt(cwd) {
  return (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * A clone of a fleet-shaped repository, as the wave works from: a bare remote
 * made from the fixture with its map committed, cloned as a person would.
 * The map is made by this workspace's engine and then stamped as an older
 * engine made it (`engine`), or left with no stamp (`engine: null`) as every
 * map before 1.23.0 is; `engine: 'as-made'` keeps the stamp it was made with.
 */
function fleetClone({ pin = '1.14.0', engine = '1.14.0', map = true, change = null, crlf = false, identity = true } = {}) {
  const base = makeRepo(FIXTURE);
  made.push(base);
  const inBase = gitAt(base);
  const workflow = join(base, WORKFLOW);
  if (pin !== '1.14.0') writeFileSync(workflow, readFileSync(workflow, 'utf8').replace('@dogfood-lab/atlas@1.14.0', `@dogfood-lab/atlas@${pin}`));
  change?.(base);
  if (inBase('status', '--porcelain') !== '') {
    inBase('add', '-A');
    inBase('-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-q', '-m', 'change');
  }
  if (map) {
    const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: base, encoding: 'utf8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    if (engine !== 'as-made') {
      const path = join(base, 'atlas', 'structure.json');
      const structure = JSON.parse(readFileSync(path, 'utf8'));
      if (engine == null) delete structure.engine;
      else structure.engine = engine;
      writeFileSync(path, `${JSON.stringify(structure, null, 2)}\n`);
    }
    inBase('add', '--', 'atlas');
    inBase('-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-q', '-m', 'map');
  }
  const remote = join(temporary('atlas-pin-bump-remote-'), 'fleet.git');
  execFileSync('git', ['clone', '-q', '--bare', base, remote]);
  const root = join(temporary('atlas-pin-bump-clone-'), 'fleet');
  execFileSync('git', ['clone', '-q', '-c', `core.autocrlf=${crlf}`, remote, root]);
  const git = gitAt(root);
  for (const [key, value] of [['maintenance.auto', 'false'], ['gc.auto', '0']]) git('config', key, value);
  if (identity) {
    git('config', 'user.name', 'fleet');
    git('config', 'user.email', 'fleet@example.com');
  }
  return { root, remote, git };
}

async function run(argv, io = {}) {
  let out = '';
  const code = await main(argv, { write: (text) => (out += text), ...io });
  return { code, out };
}

describe('atlas-pin-bump check', () => {
  it('reports each pin with its file, line, form and version, and the engine of the map', async () => {
    const { root } = fleetClone();
    const { code, out } = await run(['check', root]);
    assert.equal(code, 0);
    assert.match(out, new RegExp(`^== .+: ready to move to ${TARGET.replaceAll('.', '\\.')}\\n`));
    assert.match(out, new RegExp(`\\n {3}pin {2}\\.github/workflows/ci\\.yml:${PIN_LINE} {2}npx --yes @dogfood-lab/atlas@1\\.14\\.0 check\\n`));
    assert.match(out, /\n {3}map {2}made by 1\.14\.0\n/);
    const [result] = JSON.parse((await run(['check', '--json', root])).out);
    assert.equal(result.verdict, 'ready');
    assert.deepEqual(result.pins, [{ file: WORKFLOW, line: PIN_LINE, form: 'npx --yes', version: '1.14.0', command: 'check' }]);
    assert.deepEqual(result.checkSteps, [{ file: WORKFLOW, line: PIN_LINE }]);
    assert.deepEqual(result.map, { present: true, engine: '1.14.0' });
    assert.equal(result.target, TARGET);
  });

  it('reads a map with no engine stamp as one to make again', async () => {
    const { root } = fleetClone({ engine: null });
    const { code, out } = await run(['check', root]);
    assert.equal(code, 0);
    assert.match(out, /: ready to move to /);
    assert.match(out, /\n {3}map {2}carries no engine stamp\n/);
  });

  it('calls a clone done when every pin is the target and the map was made by it', async () => {
    const { root } = fleetClone({ pin: TARGET, engine: 'as-made' });
    const { code, out } = await run(['check', root]);
    assert.equal(code, 0);
    assert.match(out, new RegExp(`: done on ${TARGET.replaceAll('.', '\\.')}\\n`));
    assert.match(out, new RegExp(`\\n {3}map {2}made by ${TARGET.replaceAll('.', '\\.')}\\n`));
  });

  it('calls a pin that is right over a map an older engine made ready, not done', async () => {
    const { root } = fleetClone({ pin: TARGET });
    const [result] = JSON.parse((await run(['check', '--json', root])).out);
    assert.equal(result.verdict, 'ready');
  });

  it('takes the target from --version', async () => {
    const { root } = fleetClone({ pin: '1.14.0', engine: '1.14.0' });
    const { code, out } = await run(['check', '--version', '1.14.0', root]);
    assert.equal(code, 0);
    assert.match(out, /: done on 1\.14\.0\n/);
  });

  const people = [
    ['a clone with no committed map', { map: false }, null, /! PIN_BUMP_NO_MAP {2}atlas\/structure\.json is not committed\n/],
    ['a clone whose workflows run no atlas check', {
      change: (base) => writeFileSync(join(base, WORKFLOW), readFileSync(join(base, WORKFLOW), 'utf8').replace(/ {6}# The committed Atlas map[^\n]*\n {6}- name: Atlas check\n {8}run: npx --yes @dogfood-lab\/atlas@1\.14\.0 check\n/, '')),
    }, null, /! PIN_BUMP_NO_CHECK_STEP {2}no workflow step runs atlas check\n/],
    ['a clone that runs Atlas with no version', {
      change: (base) => writeFileSync(join(base, WORKFLOW), readFileSync(join(base, WORKFLOW), 'utf8').replace('npx --yes @dogfood-lab/atlas@1.14.0 check', 'npx @dogfood-lab/atlas check')),
    }, null, new RegExp(`! PIN_BUMP_UNREADABLE_FORM {2}\\.github/workflows/ci\\.yml:${PIN_LINE}: @dogfood-lab/atlas is named outside the npx --yes form: run: npx @dogfood-lab/atlas check\\n`)],
    ['a clone that pins Atlas by a variable', {
      change: (base) => writeFileSync(join(base, WORKFLOW), readFileSync(join(base, WORKFLOW), 'utf8').replace('@dogfood-lab/atlas@1.14.0', '@dogfood-lab/atlas@${ATLAS_VERSION}')),
    }, null, /! PIN_BUMP_UNREADABLE_FORM {2}\.github\/workflows\/ci\.yml:28: the version \$\{ATLAS_VERSION\} is not an exact one: /],
    ['a clone with uncommitted changes', {}, ({ root }) => writeFileSync(join(root, 'stray.txt'), 'work in progress\n'), /! PIN_BUMP_DIRTY_TREE {2}git status lists changes or untracked files\n/],
    ['a clone on another branch', {}, ({ git }) => git('switch', '-q', '-c', 'feature'), /! PIN_BUMP_NOT_DEFAULT_BRANCH {2}the clone is on feature, and the default branch is \S+\n/],
  ];
  for (const [name, options, after, expected] of people) {
    it(`leaves ${name} to a person, with the reason`, async () => {
      const clone = fleetClone(options);
      after?.(clone);
      const { code, out } = await run(['check', clone.root]);
      assert.equal(code, 1);
      assert.match(out, /: needs a person\n/);
      assert.match(out, expected);
      assert.match(out, /\n {5}hint: \S/);
    });
  }

  it('leaves a directory that is not a clone to a person', async () => {
    const plain = temporary('atlas-pin-bump-plain-');
    const { code, out } = await run(['check', plain]);
    assert.equal(code, 1);
    assert.match(out, /! PIN_BUMP_NOT_A_CLONE {2}/);
  });
});

// The engine the tests run: the npx call answered by this workspace's own
// build, whose version is the target, so no test reaches the network.
function localEngine(calls = []) {
  return (command, args, cwd) => {
    calls.push({ command, args, cwd });
    assert.deepEqual([command, ...args.slice(0, 2)], ['npx', '--yes', `@dogfood-lab/atlas@${TARGET}`]);
    const result = spawnSync(process.execPath, [CLI, ...args.slice(2)], { cwd, encoding: 'utf8' });
    return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  };
}

function snapshot(git) {
  return { status: git('status', '--porcelain'), head: git('rev-parse', 'HEAD'), refs: git('for-each-ref', '--format=%(refname) %(objectname)') };
}

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('atlas-pin-bump plan', () => {
  it('shows the pins moved and the map made again as a diff, and writes nothing to the clone', async () => {
    const { root, git } = fleetClone();
    const before = snapshot(git);
    const calls = [];
    const { code, out } = await run(['plan', root], { exec: localEngine(calls) });
    assert.equal(code, 0, out);
    assert.deepEqual(snapshot(git), before);
    assert.match(out, /\ndiff --git a\/\.github\/workflows\/ci\.yml b\/\.github\/workflows\/ci\.yml\n/);
    assert.match(out, new RegExp(`\\n- {8}run: npx --yes @dogfood-lab/atlas@1\\.14\\.0 check\\n\\+ {8}run: npx --yes @dogfood-lab/atlas@${escaped(TARGET)} check\\n`));
    assert.match(out, new RegExp(`\\n- {2}"engine": "1\\.14\\.0",\\n\\+ {2}"engine": "${escaped(TARGET)}",\\n`));
    assert.match(out, new RegExp(`\\n-- summary\\n {3}pin {4}\\.github/workflows/ci\\.yml:${PIN_LINE} {2}1\\.14\\.0 -> ${escaped(TARGET)}\\n {3}map {4}made by 1\\.14\\.0 -> made by ${escaped(TARGET)}\\n`));
    assert.match(out, /\n {3}doors {2}2 -> 2\n {3}parts {2}4 -> 4; 1 read differently\n {3}files {2}atlas\/README\.md, atlas\/page\.json, atlas\/statistics\.json, atlas\/structure\.json\n/);
    assert.deepEqual(calls.map((call) => call.args.at(-1)), ['map', 'check']);
    for (const call of calls) {
      assert.notEqual(resolve(call.cwd), resolve(root), 'the map is made in a temporary clone, never in the clone');
      assert.equal(call.cwd.split(/[\\/]/).at(-1), 'fleet', 'the temporary clone keeps the clone\'s name');
    }
  });

  it('names the notices atlas check at the target prints on the result', async () => {
    const { root } = fleetClone();
    const { code, out } = await run(['plan', root], { exec: localEngine() });
    assert.equal(code, 0);
    assert.match(out, new RegExp(`\\n-- notices from atlas check at ${escaped(TARGET)}: 1\\n {3}ATLAS_DOOR_TOOLCHAIN {2}[^\\n]+\\n {5}what changed: {3}Deploy site pins Node 20 and runs astro build; astro 7\\.3\\.3 requires Node >=22\\.12\\.0 and refuses to start\\.\\n`));
  });

  it('prints each plan as JSON', async () => {
    const { root } = fleetClone({ engine: null });
    const { code, out } = await run(['plan', '--json', root], { exec: localEngine() });
    assert.equal(code, 0);
    const [each] = JSON.parse(out);
    assert.equal(each.verdict, 'ready');
    assert.equal(each.target, TARGET);
    assert.match(each.diff, /^diff --git /);
    assert.deepEqual(each.summary.engine, { before: null, after: TARGET });
    assert.deepEqual(each.summary.pins, [{ file: WORKFLOW, line: PIN_LINE, from: '1.14.0', to: TARGET }]);
    assert.ok(each.changed.some((entry) => entry.status === 'M' && entry.path === WORKFLOW));
    assert.equal(each.notices.length, 1);
    assert.match(each.tree, /^[0-9a-f]{40,64}$/);
    assert.equal(each.temp, undefined);
  });

  it('runs no engine for a clone that is done, or one that needs a person', async () => {
    const calls = [];
    const done = fleetClone({ pin: TARGET, engine: 'as-made' });
    const person = fleetClone({ map: false });
    const { code, out } = await run(['plan', done.root, person.root], { exec: localEngine(calls) });
    assert.equal(code, 1);
    assert.match(out, new RegExp(`: done on ${escaped(TARGET)}\\n`));
    assert.match(out, /: needs a person\n[\s\S]*! PIN_BUMP_NO_MAP /);
    assert.deepEqual(calls, []);
  });

  it('leaves a clone to a person, with the engine\'s words, when the map cannot be made', async () => {
    const { root, git } = fleetClone();
    const before = snapshot(git);
    const { code, out } = await run(['plan', root], { exec: () => ({ status: 2, stdout: 'ATLAS_BOUNDARY_FILE_INVALID  The boundary file is not valid.\n', stderr: '' }) });
    assert.equal(code, 1);
    assert.match(out, new RegExp(`! PIN_BUMP_ENGINE_FAILED {2}atlas map \\(@dogfood-lab/atlas@${escaped(TARGET)}\\) exited 2:\\nATLAS_BOUNDARY_FILE_INVALID`));
    assert.deepEqual(snapshot(git), before);
  });

  it('takes only an exact version as the target', async () => {
    for (const version of ['latest', '^1.24.0', '1.24', 'v1.24.0', '1.24.0-rc.1']) {
      const { code, out } = await run(['plan', '--version', version, '.']);
      assert.equal(code, 2, version);
      assert.match(out, /is not an exact version such as 1\.24\.0/);
    }
  });
});
