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
  return (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
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
