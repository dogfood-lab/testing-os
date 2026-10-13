import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate } from './gate.mjs';
import { sample } from '../tools/test_helpers.mjs';

test('gate passes a positive number', () => {
  assert.equal(gate(sample()), true);
});
