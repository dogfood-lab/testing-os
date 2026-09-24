import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the golden loss holds', () => {
  assert.equal(JSON.parse(readFileSync('fixtures/golden.json', 'utf8')).loss, 0.25);
});
