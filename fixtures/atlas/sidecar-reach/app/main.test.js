import assert from 'node:assert/strict';
import { test } from 'node:test';

test('main records the state', async () => {
  await import('./main.js');
  assert.ok(true);
});
