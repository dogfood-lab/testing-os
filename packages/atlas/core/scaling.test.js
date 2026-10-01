import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
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
});
