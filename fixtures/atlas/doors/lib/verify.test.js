import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify } from './verify.js';

test('an empty submission is not verified', () => {
  assert.equal(verify(''), false);
});
