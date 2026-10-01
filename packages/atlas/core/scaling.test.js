import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { repositoryView } from './commands.js';
import { resolveDeclaredPath } from './resolve.js';

// The cost of a map has to grow with the repository, not with its square: a
// monorepo of thirteen thousand files took ten minutes to check, from steps
// that did work in proportion to the tree once for every member, test or
// command. Each test here makes a repository of one size and one four times
// as large and holds a step to growing about as fast.

const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function scratch() {
  const root = mkdtempSync(resolve(tmpdir(), 'atlas-scaling-'));
  roots.push(root);
  return root;
}

// A tracked set that counts the times it is walked from end to end.
class CountedSet extends Set {
  walks = 0;

  [Symbol.iterator]() {
    this.walks += 1;
    return super[Symbol.iterator]();
  }
}

function trackedTree(members, perMember) {
  const tracked = new CountedSet();
  for (let m = 0; m < members; m += 1) {
    tracked.add(`packages/m${m}/package.json`);
    for (let f = 0; f < perMember; f += 1) tracked.add(`packages/m${m}/src/f${f}.ts`);
  }
  return tracked;
}

describe('the cost of a map', () => {
  // A command that runs a built file asks for its source, and a monorepo's
  // build names one per member: each ask folded every tracked path to lower
  // case again.
  it('walks the tracked tree a fixed number of times however many built paths are asked about', () => {
    const repo = scratch();
    const walksFor = (asks) => {
      const tracked = trackedTree(40, 10);
      for (let i = 0; i < asks; i += 1) resolveDeclaredPath(repo, `packages/m${i % 40}/dist/f${i}.js`, tracked);
      return tracked.walks;
    };
    const few = walksFor(10);
    const many = walksFor(160);
    assert.equal(many, few, `the tree was walked ${few} times for 10 asks and ${many} for 160`);
  });

  // A compile names one member's sources from the root (tsc -p
  // packages/m3/tsconfig.json includes packages/m3/src/**/*), and turbo build
  // compiles every member: matching each member's globs against the whole
  // tree, and listing each directory by a scan of it, grew with the members
  // times the files. Linear is about 4x at 4x the members; the old way was
  // 16x. The bound is 8x, wide for a busy runner, and each time is the best
  // of several so one slow pass does not decide it.
  it('matches each member\'s globs in time that grows with the tree, not with members times files', () => {
    const repo = scratch();
    const compileEveryMember = (members) => {
      const view = repositoryView({ repoPath: repo, tracked: trackedTree(members, 30) });
      const started = process.hrtime.bigint();
      for (let m = 0; m < members; m += 1) {
        const files = view.filesMatching('', [`packages/m${m}/src/**/*.ts`, `packages/m${m}/src/**/*.tsx`]);
        assert.equal(files.length, 30);
        view.compact(files);
      }
      return Number(process.hrtime.bigint() - started);
    };
    const best = (members) => Math.min(...Array.from({ length: 5 }, () => compileEveryMember(members)));
    best(40);
    const small = best(150);
    const large = best(600);
    assert.ok(large < 8 * small, `4x the members took ${(large / small).toFixed(1)}x the time (${(small / 1e6).toFixed(1)} ms, then ${(large / 1e6).toFixed(1)} ms)`);
  });
});
