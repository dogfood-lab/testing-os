import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { applyMarks, statisticsProblem } from './statistics.js';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function row(name, cohesion, requested = null) {
  return { name, cohesion, requested, breakage: { collapsed: false, confidence: 'full', importsAndCoChanges: [], importsOnly: [], coChangesOnly: [] } };
}

describe('statistical snapshot', () => {
  it('requires a date when the file is present and accepts an old one', () => {
    assert.equal(statisticsProblem('{"generatedAt":""}'), 'atlas/statistics.json has no date');
    assert.equal(statisticsProblem('{"generatedAt":"2020-01-01T00:00:00.000Z"}'), null);
    const root = mkdtempSync(join(tmpdir(), 'atlas-stats-'));
    roots.push(root);
    const git = (args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
    };
    git(['init']);
    git(['config', 'core.autocrlf', 'false']);
    git(['config', 'user.email', 'atlas@example.com']);
    git(['config', 'user.name', 'atlas']);
    writeFileSync(join(root, 'readme.txt'), 'hello\n');
    git(['add', '-A']);
    git(['commit', '-m', 'start']);
    const atlas = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(atlas(['init']).status, 0);
    assert.equal(atlas(['map']).status, 0);
    const file = join(root, 'atlas', 'statistics.json');
    const dated = JSON.parse(readFileSync(file, 'utf8'));
    assert.match(dated.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    dated.generatedAt = '';
    writeFileSync(file, `${JSON.stringify(dated)}\n`);
    git(['add', '-A']);
    git(['commit', '-m', 'map']);
    const missing = atlas(['check']);
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /ATLAS_STATISTICS_UNDATED/);
    dated.generatedAt = '2020-01-01T00:00:00.000Z';
    writeFileSync(file, `${JSON.stringify(dated)}\n`);
    const old = atlas(['check']);
    assert.equal(old.status, 0, old.stdout + old.stderr);
  });

  it('ratchets the high-water mark, freezes it on the fallen floor, and resets it on rebaseline', () => {
    const first = applyMarks([row('pkg', 0.4)], null, false);
    assert.equal(first[0].highWater, 0.4);
    assert.equal(first[0].cohesionDropped, false);
    const up = applyMarks([row('pkg', 0.7)], { boundaries: first }, false);
    assert.equal(up[0].highWater, 0.7);
    const down = applyMarks([row('pkg', 0.4)], { boundaries: up }, false);
    assert.equal(down[0].highWater, 0.7);
    assert.equal(down[0].cohesionDropped, true);
    const frozen = applyMarks([row('pkg', 0.9)], { boundaries: up }, true);
    assert.equal(frozen[0].highWater, 0.7);
    assert.equal(frozen[0].cohesionDropped, false);
    const reset = applyMarks([row('pkg', 0.4, 'abc')], { boundaries: up }, false);
    assert.equal(reset[0].highWater, 0.4);
    assert.equal(reset[0].rebaseline, 'abc');
    assert.equal(reset[0].cohesionDropped, false);
    const again = applyMarks([row('pkg', 0.4, 'abc')], { boundaries: reset }, false);
    assert.equal(again[0].rebaseline, 'abc');
    assert.equal(again[0].highWater, 0.4);
    const cleared = applyMarks([row('pkg', null)], { boundaries: [{ name: 'pkg', highWater: 0, cohesion: 0 }] }, false);
    assert.equal(cleared[0].cohesion, null);
    assert.equal(cleared[0].highWater, null);
    assert.equal(cleared[0].cohesionDropped, false);
  });
});
