import assert from 'node:assert/strict';

// A helper the tests import: named test_, imported, so not a test.
export function sample() {
  const value = 3;
  assert.ok(value > 0);
  return value;
}
