import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { mapRepository } from './index.js';
import { DOORS, makeRepo } from './fixture-repo.js';

const BOUNDARIES = parse(readFileSync(join(DOORS, 'atlas', 'boundaries.yaml'), 'utf8')).boundaries.map((boundary) => ({
  name: boundary.name,
  globs: boundary.globs,
  status: boundary.status,
  role: boundary.role,
}));

const roots = [];
let doors;

function map() {
  const root = makeRepo(DOORS);
  roots.push(root);
  return mapRepository({ repoPath: root, boundaries: BOUNDARIES });
}

function door(file) {
  const found = doors.find((item) => item.file === `.github/workflows/${file}`);
  assert.ok(found, file);
  return found;
}

before(() => {
  doors = map().doors;
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('doors', () => {
  it('reads every tracked workflow in file order, .yml and .yaml alike', () => {
    assert.deepEqual(
      doors.map((item) => item.file),
      [
        '.github/workflows/broken.yml',
        '.github/workflows/checks.yml',
        '.github/workflows/ingest.yml',
        '.github/workflows/manual.yaml',
        '.github/workflows/weekly.yml',
      ],
    );
  });

  it('records a workflow that does not parse and maps the others', () => {
    assert.deepEqual(door('broken.yml'), { file: '.github/workflows/broken.yml', name: 'broken', parseError: true });
    assert.equal(doors.filter((item) => item.parseError).length, 1);
  });

  it('names a door by its workflow name, or by its file when it has none', () => {
    assert.equal(door('ingest.yml').name, 'Ingest');
    assert.equal(door('weekly.yml').name, 'weekly');
  });

  it('normalizes the string, list and map shapes of on', () => {
    assert.deepEqual(door('manual.yaml').triggers, [{ event: 'workflow_dispatch' }]);
    assert.deepEqual(door('checks.yml').triggers, [{ event: 'pull_request' }, { event: 'push' }]);
    assert.deepEqual(door('ingest.yml').triggers, [
      { event: 'repository_dispatch', types: ['submission'] },
      { event: 'workflow_dispatch' },
    ]);
    assert.deepEqual(door('weekly.yml').triggers, [
      { event: 'push', paths: ['tools/**'] },
      { event: 'schedule', cron: '0 6 * * 1' },
    ]);
  });

  it('flattens top-level and job permissions into scope:level', () => {
    assert.deepEqual(door('ingest.yml').permissions, ['contents:write']);
    assert.deepEqual(door('weekly.yml').permissions, ['contents:read']);
    assert.deepEqual(door('manual.yaml').permissions, ['all:read']);
    assert.deepEqual(door('checks.yml').permissions, []);
  });

  it('names the secrets a workflow references and whether it uses the workflow token', () => {
    assert.deepEqual(door('ingest.yml').secrets, ['GITHUB_TOKEN']);
    assert.equal(door('ingest.yml').usesWorkflowToken, true);
    assert.deepEqual(door('weekly.yml').secrets, ['HUB_TOKEN']);
    assert.equal(door('weekly.yml').usesWorkflowToken, false);
  });

  it('keeps every run step in file order, named or numbered', () => {
    assert.deepEqual(door('ingest.yml').commands, [
      { job: 'ingest', step: '1', text: 'npm ci' },
      { job: 'ingest', step: 'Ingest the submission', text: 'npm run ingest' },
      { job: 'ingest', step: 'Commit', text: 'git add records/ indexes/\ngit push\necho refreshed indexes/latest.json\n' },
    ]);
    assert.deepEqual(
      door('checks.yml').commands.map((command) => [command.job, command.step]),
      [['named', '0'], ['all', '0'], ['all', '1']],
    );
  });

  it('resolves the files a door runs by exact token and through npm scripts and their pre hooks', () => {
    assert.deepEqual(door('weekly.yml').runs, [{ path: 'tools/render.js', job: 'render' }]);
    assert.deepEqual(door('ingest.yml').runs, [
      { path: 'tools/ingest.js', job: 'ingest' },
      { path: 'tools/prepare.js', job: 'ingest' },
    ]);
  });

  it('counts a path handed to node --test as run, flags between them allowed', () => {
    assert.deepEqual(door('manual.yaml').runs, [{ path: 'lib/schema.js', job: 'say' }]);
    assert.deepEqual(door('manual.yaml').mentions, [{ path: 'package.json', job: 'say' }]);
  });

  it('records a path a command only names as a mention, never a run', () => {
    assert.deepEqual(door('ingest.yml').mentions, [{ path: 'indexes/latest.json', job: 'ingest' }]);
    assert.equal(door('ingest.yml').runs.some((run) => run.path === 'indexes/latest.json'), false);
    assert.equal(door('ingest.yml').reach.some((entry) => entry.boundary === 'indexes'), false);
  });

  it('does not split a command at parentheses inside quotes', () => {
    assert.equal(door('manual.yaml').runs.some((run) => run.path === 'package.json'), false);
  });

  it('resolves a named workspace and the whole workspace set, once per job', () => {
    assert.deepEqual(door('checks.yml').runs, [
      { path: 'packages/cli/check.js', job: 'all' },
      { path: 'packages/cli/check.js', job: 'named' },
      { path: 'tools/render.js', job: 'all' },
    ]);
  });

  it('records what a door stages, as written, and whether it pushes', () => {
    assert.deepEqual(door('ingest.yml').stages, ['indexes/', 'records/']);
    assert.equal(door('ingest.yml').pushes, true);
    assert.deepEqual(door('weekly.yml').stages, []);
    assert.equal(door('weekly.yml').pushes, false);
  });

  it('records what a door sends', () => {
    assert.deepEqual(door('weekly.yml').sends, {
      dispatchesTo: ['acme/hub'],
      publishes: false,
      releases: false,
      deploysPages: false,
    });
    assert.deepEqual(door('ingest.yml').sends.dispatchesTo, []);
  });

  it('lists the actions a door uses without their refs', () => {
    assert.deepEqual(door('ingest.yml').uses, ['actions/checkout']);
    assert.deepEqual(door('weekly.yml').uses, []);
  });

  it('orders reach by the depth each boundary is first reached, counting its files', () => {
    assert.deepEqual(door('ingest.yml').reach, [
      { boundary: 'tools', depth: 0, files: 2 },
      { boundary: 'lib', depth: 1, files: 2 },
    ]);
    assert.deepEqual(door('weekly.yml').reach, [
      { boundary: 'tools', depth: 0, files: 1 },
      { boundary: 'lib', depth: 1, files: 1 },
    ]);
    assert.deepEqual(door('manual.yaml').reach, [{ boundary: 'lib', depth: 0, files: 1 }]);
  });

  it('describes the same doors byte for byte from a second copy of the fixture', () => {
    assert.equal(JSON.stringify(map().doors), JSON.stringify(doors));
  });
});
