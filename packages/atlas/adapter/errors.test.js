import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERRORS } from './errors.js';

describe('error table', () => {
  it('gives every code one sentence', () => {
    const codes = Object.entries(ERRORS);
    assert.ok(codes.length >= 8);
    for (const [code, sentence] of codes) {
      assert.match(code, /^ATLAS_[A-Z_]+$/);
      assert.match(sentence, /^[A-Z].+\.$/);
    }
  });
});
