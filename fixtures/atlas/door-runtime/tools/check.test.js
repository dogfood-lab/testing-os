import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check } from './check.js';

test('check', () => {
  assert.equal(check(true), true);
});
