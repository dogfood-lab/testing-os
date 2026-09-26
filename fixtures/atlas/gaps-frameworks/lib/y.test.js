import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './sum.js';

test('sums nothing', () => {
  assert.equal(sum([]), 0);
});
