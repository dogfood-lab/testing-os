import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { decideFloor, loadHistory } from './history.js';

const roots = [];
const params = {
  windowDays: 180,
  pinnedStart: null,
  changeset: 50,
  changesetFraction: 0.25,
  shared: 10,
  fallenShared: 3,
  qualifyingMinimum: 30,
  strength: 0.5,
  revisions: 5,
};

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-history-'));
  roots.push(root);
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['config', 'user.email', 'atlas@example.com']);
  git(root, ['config', 'user.name', 'atlas']);
  return root;
}

function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
}

function reachDepth(root) {
  for (let rev = 0; rev < 10; rev += 1) {
    for (let file = 0; file < 20; file += 1) commit(root, { [`keep${file}.js`]: `v${rev}\n` });
  }
}

function commit(root, paths) {
  for (const [path, text] of Object.entries(paths)) write(root, path, text);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'change']);
  return git(root, ['rev-parse', 'HEAD']);
}

describe('git history', () => {
  it('names the trigger that drops the floor', () => {
    assert.equal(decideFloor(29, 20).floorTrigger, 'thin-history');
    assert.match(decideFloor(29, 20).confidenceReason, /fewer than 30 qualifying commits/);
    assert.equal(decideFloor(40, 19).floor, 'fallen');
    assert.equal(decideFloor(40, 19).floorTrigger, 'revision-depth');
    assert.match(decideFloor(40, 19).confidenceReason, /fewer than 20 source files reach 10 revisions/);
    assert.equal(decideFloor(40, 20).floor, 'strong');
    assert.equal(decideFloor(10, 0).floorTrigger, 'both');
  });

  it('counts every commit toward churn and drops a merge from coupling', () => {
    const root = repo();
    commit(root, { 'a.txt': 'a\n' });
    const branch = git(root, ['branch', '--show-current']);
    git(root, ['checkout', '-b', 'side']);
    commit(root, { 'a.txt': 'a\nmore\n' });
    git(root, ['checkout', branch]);
    const side = git(root, ['rev-parse', 'side']);
    commit(root, { 'b.txt': 'b\n' });
    git(root, ['merge', '--no-ff', side, '-m', 'merge']);
    const merge = git(root, ['rev-parse', 'HEAD']);
    const history = loadHistory(root, params);
    const churn = history.churn.find((file) => file.path === 'a.txt');
    assert.ok(churn.commits >= 3);
    assert.ok(churn.lines >= 2);
    assert.equal(history.qualifyingHashes.includes(merge), false);
  });

  it('drops a commit that touches more files than the cutoff', () => {
    const root = repo();
    const first = {};
    for (let i = 0; i < 200; i += 1) first[`f${i}.txt`] = 'x\n';
    commit(root, first);
    const many = {};
    for (let i = 0; i < 60; i += 1) many[`f${i}.txt`] = 'y\n';
    const big = commit(root, many);
    const history = loadHistory(root, params);
    assert.equal(history.qualifyingHashes.includes(big), false);
    assert.equal(history.appliedChangesetLimit, 50);
  });

  it('drops a commit that touches more than a quarter of a small tree', () => {
    const root = repo();
    for (let i = 0; i < 8; i += 1) commit(root, { [`f${i}.txt`]: 'x\n' });
    const wide = commit(root, { 'f0.txt': 'a\n', 'f1.txt': 'b\n', 'f2.txt': 'c\n' });
    const history = loadHistory(root, params);
    assert.equal(history.qualifyingHashes.includes(wide), false);
    assert.ok(history.appliedChangesetLimit <= 2);
  });

  it('omits a twice-touched file and drops a pair the larger-count measure would keep', () => {
    const fallen = repo();
    const filler = {};
    for (let i = 0; i < 8; i += 1) filler[`pad${i}.txt`] = 'p\n';
    commit(fallen, filler);
    commit(fallen, { 'once.txt': '1\n' });
    commit(fallen, { 'once.txt': '2\n' });
    // a and b each have 5 qualifying commits, 3 of them shared.
    // Dividing by the larger count gives 3/5. The union is 7, so 3/7 is under half.
    for (let i = 0; i < 3; i += 1) commit(fallen, { 'a.txt': `a${i}\n`, 'b.txt': `b${i}\n` });
    commit(fallen, { 'a.txt': 'a-extra\n' });
    commit(fallen, { 'a.txt': 'a-extra-2\n' });
    commit(fallen, { 'b.txt': 'b-extra\n' });
    commit(fallen, { 'b.txt': 'b-extra-2\n' });
    for (let i = 0; i < 4; i += 1) commit(fallen, { 'c.txt': `c${i}\n`, 'd.txt': `d${i}\n` });
    commit(fallen, { 'c.txt': 'c-extra\n' });
    commit(fallen, { 'd.txt': 'd-extra\n' });
    const thin = loadHistory(fallen, params);
    assert.equal(thin.floor, 'fallen');
    assert.equal(thin.sharedFloorUsed, 3);
    assert.equal(thin.pairs.some((pair) => pair.a === 'a.txt' && pair.b === 'b.txt'), false);
    const kept = thin.pairs.find((pair) => pair.a === 'c.txt' && pair.b === 'd.txt');
    assert.equal(kept.either, 6);
    assert.equal(kept.shared, 4);
    assert.equal(thin.pairs.some((pair) => pair.a === 'once.txt' || pair.b === 'once.txt'), false);

    const rich = repo();
    reachDepth(rich);
    const pad = {};
    for (let i = 0; i < 8; i += 1) pad[`pad${i}.txt`] = 'p\n';
    commit(rich, pad);
    for (let i = 0; i < 3; i += 1) commit(rich, { 'a.txt': `a${i}\n`, 'b.txt': `b${i}\n` });
    commit(rich, { 'a.txt': 'a-extra\n' });
    commit(rich, { 'a.txt': 'a-extra-2\n' });
    commit(rich, { 'b.txt': 'b-extra\n' });
    commit(rich, { 'b.txt': 'b-extra-2\n' });
    const strong = loadHistory(rich, params);
    assert.equal(strong.floor, 'strong');
    assert.equal(strong.pairs.some((pair) => pair.a === 'a.txt' && pair.b === 'b.txt'), false);
    assert.equal(strong.confidence ?? strong.floor, 'strong');
  });

  it('stays on the strong floor when a long history has no repeated pairs', () => {
    const root = repo();
    reachDepth(root);
    const history = loadHistory(root, params);
    assert.equal(history.floor, 'strong');
    assert.equal(history.pairs.length, 0);
    assert.ok(history.qualifyingCommits >= 30);
  });

  it('gives a renamed file the history of its old path', () => {
    const root = repo();
    commit(root, { 'a.txt': 'one\n' });
    commit(root, { 'a.txt': 'one\ntwo\n' });
    git(root, ['mv', 'a.txt', 'b.txt']);
    git(root, ['commit', '-m', 'rename']);
    commit(root, { 'b.txt': 'one\ntwo\nthree\n' });
    const history = loadHistory(root, params);
    const churn = history.churn.find((file) => file.path === 'b.txt');
    assert.ok(churn.commits >= 4);
    assert.equal(history.churn.some((file) => file.path === 'a.txt'), false);
  });
});
