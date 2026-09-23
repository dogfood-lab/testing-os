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

  it('carries no code of the retired acceptance ladder or machine render', () => {
    for (const code of ['ATLAS_ACCEPTED_UNAUTHORED', 'ATLAS_DEFERRED_WITHOUT_REASON', 'ATLAS_MACHINE_HASH_MISMATCH']) {
      assert.equal(code in ERRORS, false, code);
    }
    assert.equal(ERRORS.ATLAS_BOUNDARY_EMPTY, 'A boundary matches no files.');
  });
});
