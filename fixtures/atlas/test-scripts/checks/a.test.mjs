import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate } from '../src/gate.mjs';

test('gate passes zero', () => assert.equal(gate(0), true));
