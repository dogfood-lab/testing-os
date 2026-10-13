import assert from 'node:assert/strict';
import { gate } from '../src/gate.mjs';

assert.equal(gate(1), true);
assert.equal(gate(-1), false);
console.log('gate: ok');
