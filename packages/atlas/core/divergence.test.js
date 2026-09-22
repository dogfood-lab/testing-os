import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyMarks } from '../adapter/statistics.js';
import { divergenceHits } from './divergence.js';

const boundaries = [
  { name: 'alpha', files: ['alpha/a.js', 'alpha/own.js'] },
  { name: 'beta', files: ['beta/b.js', 'beta/own.js'] },
];

function hits(overrides) {
  return divergenceHits({
    boundaries,
    pairs: [],
    marks: [],
    floor: 'strong',
    strengthFloor: 0.5,
    drop: 0.2,
    ...overrides,
  });
}

describe('divergence rules', () => {
  it('fires leaks when outside strength exceeds inside strength', () => {
    const rows = hits({
      pairs: [
        { a: 'alpha/a.js', b: 'beta/b.js', strength: 0.8 },
        { a: 'beta/b.js', b: 'beta/own.js', strength: 0.9 },
      ],
    });
    const leaks = rows.filter((row) => row.rule === 'leaks');
    assert.deepEqual(leaks.map((row) => row.boundary), ['alpha']);
    assert.equal(leaks[0].value, 0.8);
    assert.equal(leaks[0].threshold, 0);
    assert.equal(leaks[0].confidence, 'full');
  });

  it('fires two-may-be-one when the pair exceeds the smaller internal strength', () => {
    const firing = hits({
      pairs: [
        { a: 'alpha/a.js', b: 'alpha/own.js', strength: 0.2 },
        { a: 'beta/b.js', b: 'beta/own.js', strength: 0.9 },
        { a: 'alpha/a.js', b: 'beta/b.js', strength: 0.6 },
      ],
    });
    const row = firing.find((item) => item.rule === 'two-may-be-one');
    assert.deepEqual(row.boundaries, ['alpha', 'beta']);
    assert.equal(row.value, 0.6);
    assert.equal(row.threshold, 0.2);
    const quiet = hits({
      pairs: [
        { a: 'alpha/a.js', b: 'alpha/own.js', strength: 0.9 },
        { a: 'beta/b.js', b: 'beta/own.js', strength: 0.9 },
        { a: 'alpha/a.js', b: 'beta/b.js', strength: 0.4 },
      ],
    });
    assert.equal(quiet.some((item) => item.rule === 'two-may-be-one'), false);
  });

  it('fires file-moved only when the strongest partner is in another boundary', () => {
    const moved = hits({
      pairs: [
        { a: 'alpha/a.js', b: 'alpha/own.js', strength: 0.4 },
        { a: 'alpha/a.js', b: 'beta/b.js', strength: 0.8 },
      ],
    });
    const row = moved.find((item) => item.rule === 'file-moved' && item.file === 'alpha/a.js');
    assert.equal(row.boundary, 'alpha');
    assert.equal(row.partner_boundary, 'beta');
    assert.equal(row.value, 0.8);
    assert.equal(row.threshold, 0.5);
    const home = hits({
      pairs: [
        { a: 'alpha/a.js', b: 'alpha/own.js', strength: 0.9 },
        { a: 'alpha/a.js', b: 'beta/b.js', strength: 0.4 },
      ],
    });
    assert.equal(home.some((item) => item.file === 'alpha/a.js'), false);
  });

  it('fires a drop of 0.20 and not a drop of 0.19, and never on the first render', () => {
    const exact = hits({ marks: [{ name: 'alpha', highWater: 0.8, cohesion: 0.6 }] });
    const drop = exact.find((row) => row.rule === 'cohesion-dropped');
    assert.equal(drop.value, 0.2);
    assert.equal(drop.threshold, 0.2);
    assert.equal(drop.high_water_mark, 0.8);
    assert.equal(drop.current, 0.6);
    const shy = hits({ marks: [{ name: 'alpha', highWater: 0.8, cohesion: 0.61 }] });
    assert.equal(shy.some((row) => row.rule === 'cohesion-dropped'), false);
    const first = hits({ marks: [{ name: 'alpha', highWater: null, cohesion: 0.4 }] });
    assert.equal(first.some((row) => row.rule === 'cohesion-dropped'), false);
  });

  it('labels every row low on the fallen floor and does not file a drop across a floor change', () => {
    const rows = hits({
      floor: 'fallen',
      pairs: [{ a: 'alpha/a.js', b: 'beta/b.js', strength: 0.8 }],
      marks: [{ name: 'alpha', highWater: 0.9, cohesion: 0.5 }],
    });
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.confidence === 'low'));
    assert.equal(rows.some((row) => row.rule === 'cohesion-dropped'), false);
  });

  it('applies a rebaseline before the drop rule, so the clear does not re-file', () => {
    const marked = applyMarks(
      [{ name: 'alpha', cohesion: 0.5, requested: 'now', qualifyingSourceCommits: 40, confidence: 'full', breakage: {} }],
      { boundaries: [{ name: 'alpha', highWater: 0.9, cohesion: 0.9, rebaseline: null }] },
      false,
    );
    assert.equal(marked[0].highWater, 0.5);
    assert.equal(marked[0].cohesionDropped, false);
    const rows = hits({ marks: marked });
    assert.equal(rows.some((row) => row.rule === 'cohesion-dropped'), false);
  });
});
