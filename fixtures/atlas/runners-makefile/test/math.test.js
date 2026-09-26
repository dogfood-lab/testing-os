import assert from 'node:assert/strict';
import { test } from 'node:test';
import { square } from '../lib/math.js';

test('squares', () => {
  assert.equal(square(3), 9);
});
