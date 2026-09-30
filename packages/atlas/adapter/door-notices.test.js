import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { ENGINE } from './engine.js';
import { commitAll, mappedRepository } from '../sidecar/test-client.js';
import { assertInventsNothing, committedMap, explainJson } from '../sidecar/test-oracle.js';
import { createTools } from '../sidecar/tools.js';

/**
 * Where the door checks' findings show (docs/atlas-production.spec.md,
 * Part 4, and acceptance 7): atlas check prints a Notices block after its
 * verdict, in the error shape without an exit line, computed from the tree
 * at check time; the exit code is unchanged and --strict makes a notice exit
 * 1; a map made by an older engine, or with no stamp, passes with the engine
 * notice. atlas explain on a workflow and atlas_explain give each job's
 * runtime and the door's findings; atlas_overview gives both on every door;
 * atlas_check_change gives the findings on the doors a changed workflow,
 * lock or manifest touches, read from the tree, beside "a full refresh is
 * needed". Atlas posts nothing by itself.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const roots = [];
const tools = createTools();

after(async () => {
  await tools.stop();
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function repository(fixture) {
  const root = mappedRepository(join(FIXTURES, fixture), { prefix: `atlas-door-notices-${fixture}-` });
  roots.push(root);
  return root;
}

function atlas(root, ...args) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, lines: run.stdout.trimEnd().split('\n') };
}

function notices(stdout) {
  const at = stdout.indexOf('\nNotices\n');
  return at === -1 ? [] : stdout.slice(at + '\nNotices\n'.length).split('\n').filter((line) => /^ATLAS_[A-Z_]+ {2}/.test(line)).map((line) => line.split(' ')[0]);
}

const toolchain = repository('door-toolchain');
const lockfile = repository('door-lockfile');

describe('atlas check with notices', () => {
  it('passes with a Notices block after the verdict, in the error shape without an exit line', () => {
    const { status, stdout } = atlas(lockfile, 'check');
    assert.equal(status, 0, stdout);
    assert.ok(stdout.startsWith('atlas check\n  boundaries match the committed map\n\nNotices\n'), stdout);
    const block = stdout.slice(stdout.indexOf('Notices\n'));
    assert.equal(block, [
      'Notices',
      'ATLAS_DOOR_LOCKFILE_PLATFORM  A lockfile a door installs from holds no native binding for the job\'s platform.',
      '  what changed:   site/package-lock.json holds no linux-x64 binding for @tailwindcss/oxide, esbuild, lightningcss and 3 more (it holds win32-x64 only); Matrix build runs npm ci on ubuntu-latest.',
      '                  read from .github/workflows/matrix.yml:13, site/package-lock.json:39, site/package-lock.json:57, site/package-lock.json:68',
      '  what to do:     rewrite site/package-lock.json with npm 11.3.0 or later, the release that carries the fix for npm/cli issue 4828 (https://github.com/npm/cli/issues/4828)',
      'ATLAS_DOOR_LOCKFILE_PLATFORM  A lockfile a door installs from holds no native binding for the job\'s platform.',
      '  what changed:   site/package-lock.json holds no linux-x64 binding for @tailwindcss/oxide, esbuild, lightningcss and 3 more (it holds win32-x64 only); Deploy site runs npm ci on ubuntu-latest.',
      '                  read from .github/workflows/pages.yml:13, site/package-lock.json:39, site/package-lock.json:57, site/package-lock.json:68',
      '  what to do:     rewrite site/package-lock.json with npm 11.3.0 or later, the release that carries the fix for npm/cli issue 4828 (https://github.com/npm/cli/issues/4828)',
      '',
    ].join('\n'));
    assert.doesNotMatch(block, /^exit /m);
  });

  it('exits 1 under --strict when there is a notice, and 0 when there is none', () => {
    const strict = atlas(toolchain, 'check', '--strict');
    assert.equal(strict.status, 1, strict.stdout);
    assert.ok(notices(strict.stdout).includes('ATLAS_DOOR_TOOLCHAIN'));
    assert.match(strict.stdout, /--strict: 6 notices fail the check\nexit 1\n$/);
    const quiet = repository('explain-workflow');
    const clean = atlas(quiet, 'check', '--strict');
    assert.equal(clean.status, 0, clean.stdout);
    assert.equal(clean.stdout, 'atlas check\n  boundaries match the committed map\n');
  });

  it('computes the findings from the tree at check time, not from the committed map', () => {
    const root = repository('door-toolchain');
    const path = join(root, '.github', 'workflows', 'pages.yml');
    writeFileSync(path, readFileSync(path, 'utf8').replace('node-version: 20', 'node-version: 22'));
    const now = atlas(root, 'check');
    assert.equal(now.status, 0, now.stdout);
    assert.doesNotMatch(now.stdout, /Deploy site pins Node 20/);
    assert.match(now.stdout, /Deploy from file pins Node 20/);
    const committed = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
    assert.ok(committed.doors.find((door) => door.name === 'Deploy site').findings, 'the committed map still records it');
  });

  it('refuses an argument it does not take', () => {
    const { status, stdout } = atlas(lockfile, 'check', '--loud');
    assert.equal(status, 2);
    assert.match(stdout, /^atlas: unknown argument --loud; check takes --strict\nexit 2\n$/);
  });
});

describe('an adopter on a map an older engine made', () => {
  function older(engine) {
    const root = repository('explain-workflow');
    const path = join(root, 'atlas', 'structure.json');
    const structure = JSON.parse(readFileSync(path, 'utf8'));
    if (engine == null) delete structure.engine;
    else structure.engine = engine;
    writeFileSync(path, `${JSON.stringify(structure, null, 2)}\n`);
    commitAll(root, 'an older map');
    return root;
  }

  it('passes with the engine notice when the map carries no engine stamp, and fails under --strict', () => {
    const root = older(null);
    const run = atlas(root, 'check');
    assert.equal(run.status, 0, run.stdout);
    assert.deepEqual(notices(run.stdout), ['ATLAS_MAP_ENGINE_OLDER']);
    assert.ok(run.stdout.includes(`  what changed:   the map carries no engine stamp; this is Atlas ${ENGINE}\n  what to do:     run atlas map and commit atlas/\n`), run.stdout);
    assert.equal(atlas(root, 'check', '--strict').status, 1);
  });

  it('names the engine that made the map and the one running', () => {
    const run = atlas(older('1.14.0'), 'check');
    assert.equal(run.status, 0, run.stdout);
    assert.ok(run.stdout.includes(`  what changed:   the map was made by Atlas 1.14.0; this is ${ENGINE}\n`), run.stdout);
  });
});

describe('atlas explain on a workflow, and atlas_explain', () => {
  it('says each job\'s runtime and the door\'s findings, from the map', () => {
    const { lines } = atlas(toolchain, 'explain', '.github/workflows/pages.yml');
    assert.ok(lines.includes('Job `build` runs on ubuntu-latest (linux-x64, glibc) and pins Node 20: "Install" runs npm; "Build" runs npm; the job runs site/src/.'), lines.join('\n'));
    assert.ok(lines.includes('Finding D1, a notice: Deploy site pins Node 20 and runs astro build; astro 7.3.3 requires Node >=22.12.0 and refuses to start. Read from .github/workflows/pages.yml:10, .github/workflows/pages.yml:17 and site/package-lock.json:9. To do: pin a Node version astro accepts (>=22.12.0), or use a release of astro that accepts 20; the start check is in withastro/astro, packages/astro/bin/astro.mjs.'), lines.join('\n'));
    const json = explainJson(toolchain, '.github/workflows/pages.yml');
    assert.equal(json.door.findings[0].rule, 'D1');
    assert.deepEqual(json.door.jobs[0].runtime.setup, [{ ranges: [{ from: '20', range: '>=20.0.0 <21.0.0-0' }], step: 'Setup Node', uses: 'actions/setup-node', version: '20' }]);
  });

  it('lists the checks it could not judge', () => {
    const { lines } = atlas(toolchain, 'explain', '.github/workflows/lts.yml');
    assert.ok(lines.includes('Not judged by D1: astro build in job `build`, "Build", since lts/*.'), lines.join('\n'));
    assert.ok(lines.includes('Job `build` runs on ubuntu-latest (linux-x64, glibc) and pins Node lts/* (not resolved offline): "Install" runs npm; "Build" runs npm; the job runs site/src/.'), lines.join('\n'));
  });

  it('gives atlas_explain the same door, inventing nothing, with what it could not judge', async () => {
    const result = await tools.callTool('atlas_explain', { path: '.github/workflows/lts.yml' }, { roots: [], cwd: toolchain });
    assert.notEqual(result.isError, true, result.content[0].text);
    const { answer } = result.structuredContent;
    assertInventsNothing('atlas_explain', answer, committedMap(toolchain), { explained: explainJson(toolchain, '.github/workflows/lts.yml') });
    const unjudged = answer.cannotSee.find((entry) => entry.what === 'check');
    assert.deepEqual(unjudged.named, [{ door: 'Deploy on LTS', rule: 'D1', job: 'build', step: 'Build', tool: 'astro build', why: 'lts/*' }]);
    assert.match(result.content[0].text, /Atlas cannot judge 1 door check: it needs a runtime only a run can know, or a lock Atlas cannot read\./);
  });
});

describe('atlas_overview', () => {
  it('gives the runtime and findings of every door, inventing nothing', async () => {
    const result = await tools.callTool('atlas_overview', { full: true }, { roots: [], cwd: lockfile });
    assert.notEqual(result.isError, true, result.content[0].text);
    const { answer } = result.structuredContent;
    assertInventsNothing('atlas_overview', answer, committedMap(lockfile));
    const found = answer.facts.filter((group) => group.fact === 'doorFindings').flatMap((group) => group.items);
    assert.deepEqual(found.map((item) => [item.door, item.rule, item.lock]), [['Deploy site', 'D2', 'site/package-lock.json'], ['Matrix build', 'D2', 'site/package-lock.json']]);
    const runtime = answer.facts.filter((group) => group.fact === 'doorRuntime').flatMap((group) => group.items);
    assert.deepEqual(runtime.find((item) => item.door === 'Windows build').jobs[0].runsOn, [{ labels: ['windows-latest'], platform: { cpu: 'x64', os: 'win32' } }]);
    assert.match(result.content[0].text, /Atlas: finding D2, a notice: site\/package-lock\.json holds no linux-x64 binding/);
  });
});

describe('atlas_check_change', () => {
  it('gives the findings on the door a changed workflow is, read from the tree, beside a full refresh', async () => {
    const root = repository('door-toolchain');
    const path = join(root, '.github', 'workflows', 'pages-22.yml');
    writeFileSync(path, readFileSync(path, 'utf8').replace('node-version: 22', 'node-version: 20'));
    const result = await tools.callTool('atlas_check_change', {}, { roots: [], cwd: root });
    assert.notEqual(result.isError, true, result.content[0].text);
    const { answer } = result.structuredContent;
    assert.equal(answer.verdict.fullRefresh.needed, true);
    const [group] = answer.facts;
    assert.deepEqual([group.fact, group.basis, group.source], ['doorFindings', 'declared', 're-read']);
    assert.deepEqual(group.items.map((item) => [item.door, item.rule, item.sentence]), [['Deploy site on 22', 'D1', 'Deploy site on 22 pins Node 20 and runs astro build; astro 7.3.3 requires Node >=22.12.0 and refuses to start.']]);
    assert.match(result.content[0].text, /a full refresh is needed/);
    assert.match(result.content[0].text, /Atlas: finding D1 on the tree as it is now, a notice: "?Deploy site on 22"? pins Node 20/);
  });

  it('gives the findings on every door a changed lock touches, and says a lockfile needs a full refresh', async () => {
    const root = repository('door-lockfile');
    const path = join(root, 'site', 'package-lock.json');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
    const result = await tools.callTool('atlas_check_change', {}, { roots: [], cwd: root });
    const { answer } = result.structuredContent;
    assert.deepEqual(answer.verdict.fullRefresh.because, [{ path: 'site/package-lock.json', why: 'a lockfile' }]);
    const found = answer.facts.flatMap((entry) => entry.items);
    assert.deepEqual(found.map((item) => item.door), ['Matrix build', 'Deploy site'], 'in the order of their workflow files');
    assert.ok(answer.cannotSee.some((entry) => entry.what === 'check' && entry.named.some((item) => item.door === 'Own runner' && item.why === 'self-hosted')));
  });

  it('says the checks find nothing on a touched door that is clean', async () => {
    const root = repository('door-lockfile');
    const path = join(root, 'complete', 'package-lock.json');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
    const result = await tools.callTool('atlas_check_change', {}, { roots: [], cwd: root });
    assert.deepEqual(result.structuredContent.answer.facts, []);
    assert.match(result.content[0].text, /Atlas: the door checks find nothing on "?Service"? as the tree stands\./);
  });
});
