/**
 * collapse-alternation.test.js — the brace collapse behind the freeze gate's glob overlap check.
 *
 * `{a,b,c}` collapses to its first alternative. The pattern that did it let its repeated group
 * match commas too, so an unclosed `{` followed by many commas could be split in exponentially
 * many ways before the match failed (28 commas took 595 ms and each comma doubled it). Pins the
 * collapse's results and that the failing case now answers at once.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collapseAlternation } from './lib/domains.js';

describe('collapseAlternation', () => {
  it('collapses a brace group to its first alternative', () => {
    assert.equal(collapseAlternation('src/{a,b,c}/f.js'), 'src/a/f.js');
    assert.equal(collapseAlternation('src/{a}/f.js'), 'src/a/f.js');
    assert.equal(collapseAlternation('src/{}/f.js'), 'src//f.js');
    assert.equal(collapseAlternation('{x,y}/{p,q,r}.ts'), 'x/p.ts');
  });

  it('collapses an empty first alternative and keeps what follows the group', () => {
    assert.equal(collapseAlternation('src/f{,.min}.js'), 'src/f.js');
  });

  it('collapses a character class to its first member, or to x when negated', () => {
    assert.equal(collapseAlternation('src/[abc]/f.js'), 'src/a/f.js');
    assert.equal(collapseAlternation('src/[^abc]/f.js'), 'src/x/f.js');
  });

  it('leaves an unclosed brace alone', () => {
    assert.equal(collapseAlternation('src/{a,b/f.js'), 'src/{a,b/f.js');
  });

  it('answers an unclosed brace over many commas at once', () => {
    // The old pattern doubled with each comma: 28 took 0.6 s, 30 took 2.4 s, 32 took 13 s. 32 fails
    // it in seconds without hanging a run; 5000 shows the collapse stays linear.
    for (const commas of [32, 5000]) {
      const glob = `src/{${','.repeat(commas)}`;
      const started = performance.now();
      assert.equal(collapseAlternation(glob), glob);
      assert.ok(performance.now() - started < 1000, `${commas} commas took ${Math.round(performance.now() - started)} ms`);
    }
  });
});
