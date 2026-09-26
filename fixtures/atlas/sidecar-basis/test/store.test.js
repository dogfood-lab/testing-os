import assert from 'node:assert/strict';
import { test } from 'node:test';
import { save } from '../lib/store.js';

test('save pads the id', () => {
  assert.equal(save({ id: 'a' }).length, 8);
});
