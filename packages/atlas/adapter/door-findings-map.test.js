import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

/**
 * Findings in the map (docs/atlas-production.spec.md, Part 3 and acceptance
 * 8): atlas map records on each door the findings of the door checks, with
 * their rule, job, step, facts and the lines they were read from, and what
 * the checks could not judge; sorted, and byte for byte the same on a CRLF
 * checkout as on an LF one (fixtures/atlas/door-toolchain and door-lockfile).
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/atlas');
const DATES = { GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
const roots = [];
const maps = {};

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...DATES } });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// The fixture committed from LF files, or from the same files with CRLF
// endings added under core.autocrlf, as a Windows checkout holds them, and
// mapped.
function mapped(fixture, crlf) {
  const root = mkdtempSync(join(tmpdir(), `atlas-door-findings-${crlf ? 'crlf' : 'lf'}-`));
  roots.push(root);
  cpSync(join(FIXTURES, fixture), root, { recursive: true });
  if (crlf) for (const path of files(root)) writeFileSync(path, readFileSync(path, 'utf8').replaceAll('\n', '\r\n'));
  git(root, ['init', '-q']);
  git(root, ['config', 'core.autocrlf', crlf ? 'true' : 'false']);
  git(root, ['config', 'core.safecrlf', 'false']);
  git(root, ['config', 'maintenance.auto', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', fixture]);
  const run = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  return { root, text: readFileSync(join(root, 'atlas', 'structure.json'), 'utf8') };
}

before(() => {
  for (const fixture of ['door-toolchain', 'door-lockfile']) maps[fixture] = { lf: mapped(fixture, false), crlf: mapped(fixture, true) };
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

const door = (fixture, file) => JSON.parse(maps[fixture].lf.text).doors.find((entry) => entry.file === `.github/workflows/${file}`);

describe('findings in the map', () => {
  it('records each finding on its door with its rule, job, step, facts and lines', () => {
    const [toolchain] = door('door-toolchain', 'pages.yml').findings;
    assert.deepEqual(toolchain, {
      job: 'build',
      lines: [
        { file: '.github/workflows/pages.yml', line: 10 },
        { file: '.github/workflows/pages.yml', line: 17 },
        { file: 'site/package-lock.json', line: 9 },
      ],
      package: 'astro',
      pinnedBy: { step: 'Setup Node', version: '20' },
      pins: ['20'],
      refuses: true,
      requires: '>=22.12.0',
      rule: 'D1',
      step: 'Build',
      tool: 'astro build',
      version: '7.3.3',
    });
    const [platform] = door('door-lockfile', 'pages.yml').findings;
    assert.equal(platform.rule, 'D2');
    assert.deepEqual(platform.packages, ['@tailwindcss/oxide', 'esbuild', 'lightningcss', 'rollup', 'satteri', 'sharp']);
    assert.equal(door('door-toolchain', 'pages-22.yml').findings, undefined, 'a door with no finding carries none');
  });

  it('records what a check could not judge apart from the findings', () => {
    const lts = door('door-toolchain', 'lts.yml');
    assert.equal(lts.findings, undefined);
    assert.deepEqual(lts.unresolvedChecks.map((entry) => [entry.rule, entry.tool, entry.why]), [['D1', 'astro build', 'lts/*']]);
  });

  it('keeps the findings sorted by rule, job and step', () => {
    for (const fixture of Object.keys(maps)) {
      for (const entry of JSON.parse(maps[fixture].lf.text).doors) {
        const keys = (entry.findings ?? []).map((finding) => [finding.rule, finding.job, finding.step].join('\0'));
        assert.deepEqual(keys, [...keys].sort(), entry.file);
      }
    }
  });

  it('is byte for byte the same map on a CRLF checkout, findings included', () => {
    for (const fixture of Object.keys(maps)) {
      assert.ok(maps[fixture].lf.text.includes('"findings"'), fixture);
      assert.equal(maps[fixture].crlf.text, maps[fixture].lf.text, fixture);
    }
  });

  it('is the same map when mapped again', () => {
    const { root, text } = maps['door-lockfile'].lf;
    const run = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout);
    assert.equal(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'), text);
  });
});
