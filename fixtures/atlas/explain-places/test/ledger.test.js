import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the ledger holds a latest entry', () => {
  const latest = JSON.parse(readFileSync('store/ledger/latest.json', 'utf8'));
  assert.ok(latest.id);
});
