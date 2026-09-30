import assert from 'node:assert/strict';
import { test } from 'node:test';
import { total } from './core.js';

test('total adds the values', () => {
  assert.equal(total([1, 2, 3]), 6);
});
