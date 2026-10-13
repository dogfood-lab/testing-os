import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate } from '../src/gate.mjs';

test('gate refuses a negative number', () => {
  assert.equal(gate(-2), false);
});
