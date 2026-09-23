import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readBoundaryFile } from './boundary-file.js';
import { buildPage, mainDoor, runsShown, triggerPhrases } from './page.js';

// The page's sentences about doors read the way the tools they run are used:
// fixtures/atlas/doors-py and doors-ts, mapped through the CLI.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas');
const roots = [];
let py;
let ts;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function mappedCopy(fixture) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-page-doors-'));
  roots.push(root);
  cpSync(join(FIXTURES, fixture), root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', fixture]);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  return {
    structure: JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8')),
    statistics: JSON.parse(readFileSync(join(root, 'atlas', 'statistics.json'), 'utf8')),
    document: readBoundaryFile(root),
    markdown: readFileSync(join(root, 'atlas', 'README.md'), 'utf8'),
    json: JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')),
  };
}

function section(markdown, heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next).split('\n');
}

function has(markdown, heading, sentence) {
  assert.ok(section(markdown, heading).includes(sentence), `${heading}: ${sentence}`);
}

before(() => {
  py = mappedCopy('doors-py');
  ts = mappedCopy('doors-ts');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('doors on the page, by the conventions of their tools', () => {
  it('names what a Python CI runs and reaches, and follows it as the busiest door', () => {
    has(py.markdown, '## What this is', '7 parts. Work enters through 5 doors; the busiest is CI, which reaches 5 parts.');
    has(py.markdown, '## What comes in', '1. **CI.** On a pull request touching 2 paths; on a push to main; when a tag matching `v*` is pushed; or by hand. Runs scripts/, src/, tests/ and 2 more.');
    has(py.markdown, '## What happens through CI', '1. The workflow runs verify.sh in the repository root, scripts/ in scripts, src/ in src, tests/ in tests and tool/ in tool.');
  });

  it('words a release trigger by its types', () => {
    has(py.markdown, '## What comes in', '5. **Publish.** When a release is published. Runs no file this map can see.');
    has(py.markdown, '## What comes in', '4. **Image smoke.** On a release event. Runs no file this map can see.');
  });

  it('says where a door publishes, and when it opens an issue', () => {
    has(py.markdown, '## The other doors', '**Publish** runs no file this map can see and publishes to PyPI and a container image.');
    has(py.markdown, '## The other doors', '**Nightly** runs scripts/smoke.py, reaches src, and opens an issue when it fails.');
    has(py.markdown, '## The other doors', '**Image smoke** runs no file this map can see and opens an issue.');
    has(ts.markdown, '## The other doors', '**Release** runs no file this map can see, publishes to npm and a container image, and creates a GitHub release.');
  });

  it('never prints a staged variable: a path set at run time is said to be one, last', () => {
    has(py.markdown, '## The other doors', '**Baseline** runs no file this map can see, writes to reports/, commits reports/baseline.txt, reports/run.log, reports/summary.md and a path set at run time, then pushes, and opens a pull request.');
    assert.equal(py.markdown.includes('$RUNTIME_PATH'), false);
    const baseline = py.json.doors.find((item) => item.name === 'Baseline');
    assert.deepEqual(baseline.stages, ['reports/baseline.txt', 'reports/run.log', 'reports/summary.md', 'a path set at run time']);
  });

  it('names a directory in place of the runs a tool matched under it, and keeps what the commands name', () => {
    // eslint covers scripts/ and bin/, but the workflow runs bin/tool.js and
    // the scripts by name, so they lead; vitest's and tsc's matches under
    // packages/ are part of that directory.
    has(ts.markdown, '## What comes in', '1. **CI.** On a pull request touching 2 paths; on a push touching 2 paths; or by hand. Runs bin/tool.js, scripts/bun-task.ts, scripts/deno-task.ts and 12 more.');
    has(ts.markdown, '## What happens through CI', '1. The workflow runs bin/tool.js and bin/ in bin, eslint.config.js and vitest.config.ts in the repository root, 8 files in scripts, test/ in test, tools/ in tools, and packages/ (2 parts).');
    const ci = ts.json.doors.find((item) => item.name === 'CI');
    assert.deepEqual(ci.runs, [
      'bin/tool.js', 'scripts/bun-task.ts', 'scripts/deno-task.ts', 'scripts/gate.mjs', 'scripts/helper.mjs', 'scripts/loaded.ts', 'scripts/register.mjs', 'scripts/task.ts',
      'bin/', 'eslint.config.js', 'packages/', 'scripts/', 'test/', 'tools/', 'vitest.config.ts',
    ]);
    assert.equal(ci.runsCount, 15);
  });

  it('names a path under a directory the commands also name only once', () => {
    // pytest runs tests/ and coverage runs tests/test_core.py; bandit runs
    // scripts/ and verify.sh runs scripts/check.py.
    const ci = py.json.doors.find((item) => item.name === 'CI');
    assert.deepEqual(ci.runs, ['scripts/', 'src/', 'tests/', 'tool/', 'verify.sh']);
  });

  it('counts the runs the artifact did not record when it capped the list', () => {
    const structure = {
      ...py.structure,
      doors: py.structure.doors.map((item) => (item.name !== 'Nightly' ? item : { ...item, runsCount: 250 })),
    };
    const { markdown } = buildPage({ structure, statistics: py.statistics, document: py.document, repoName: 'acme/doors-py' });
    has(markdown, '## What comes in', '2. **Nightly.** On a schedule (`0 4 * * 1`), Monday at 04:00 UTC; or by hand. Runs scripts/smoke.py and 249 more.');
    assert.equal(runsShown(['a', 'b', 'c', 'd'], 10), 'a, b, c and 7 more');
    assert.equal(runsShown(['a', 'b']), 'a and b');
  });

  it('names a push filtered by branches and tags as both, and a pull request by its paths', () => {
    assert.deepEqual(triggerPhrases({ triggers: [{ event: 'push', branches: ['main'], tags: ['v*'], paths: ['src/**'] }] }), [
      'on a push to main touching 1 path',
      'when a tag matching `v*` is pushed',
    ]);
    assert.deepEqual(triggerPhrases({ triggers: [{ event: 'push', tags: ['v*'] }] }), ['when a tag matching `v*` is pushed']);
    assert.deepEqual(triggerPhrases({ triggers: [{ event: 'pull_request', paths: ['a/**', 'b/**'] }] }), ['on a pull request touching 2 paths']);
    assert.deepEqual(triggerPhrases({ triggers: [{ event: 'release' }] }), ['on a release event']);
  });
});

describe('the busiest door', () => {
  const reach = (n) => Array.from({ length: n }, (_, i) => ({ boundary: `part${i}`, depth: 0, files: 1 }));
  const at = (name, triggers, parts) => ({ file: `.github/workflows/${name}.yml`, name, triggers, reach: reach(parts) });

  it('is the door that reaches most', () => {
    const ci = at('ci', [{ event: 'push' }], 1);
    const nightly = at('a-nightly', [{ event: 'schedule', cron: '0 4 * * 1' }], 3);
    assert.equal(mainDoor([ci, nightly]), nightly);
  });

  it('is a door that commits into the repository before a wider one that does not', () => {
    const ci = at('ci', [{ event: 'push' }], 11);
    const ingest = { ...at('ingest', [{ event: 'repository_dispatch' }], 7), stages: ['records/'] };
    assert.equal(mainDoor([ci, ingest]), ingest);
    // A door that commits but reaches nothing is not followed; the widest is.
    const baseline = { ...at('baseline', [{ event: 'workflow_dispatch' }], 0), stages: ['reports/x.txt'] };
    assert.equal(mainDoor([ci, baseline]), ci);
  });

  it('is a push or pull request door when a scheduled one reaches as far', () => {
    const nightly = at('a-nightly', [{ event: 'schedule', cron: '0 4 * * 1' }, { event: 'workflow_dispatch' }], 2);
    const ci = at('ci', [{ event: 'pull_request' }], 2);
    assert.equal(mainDoor([nightly, ci]), ci);
  });

  it('is never a door that reaches nothing, and is no door when none reaches anything', () => {
    const empty = at('a-empty', [{ event: 'push' }], 0);
    const smoke = at('smoke', [{ event: 'schedule' }], 1);
    assert.equal(mainDoor([empty, smoke]), smoke);
    assert.equal(mainDoor([empty]), null);
    assert.equal(mainDoor([{ file: '.github/workflows/broken.yml', name: 'broken', parseError: true }]), null);
  });

  it('says so when no door reaches a part, rather than following one', () => {
    const structure = { ...py.structure, doors: py.structure.doors.map((item) => ({ ...item, runs: [], runsCount: 0, reach: [] })) };
    const { markdown, json } = buildPage({ structure, statistics: py.statistics, document: py.document, repoName: 'acme/doors-py' });
    has(markdown, '## What this is', '7 parts. Work enters through 5 doors, and none of them runs a file this map can see.');
    has(markdown, '## Where to start', 'No door runs a file this map can see, so there is no path through this repository to follow.');
    assert.equal(markdown.includes('## What happens through'), false);
    assert.equal(JSON.parse(json).mainDoor, null);
  });
});
