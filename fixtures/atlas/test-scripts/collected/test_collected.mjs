import { expect, test } from 'vitest';
import { gate } from '../src/gate.mjs';

test('gate passes five', () => expect(gate(5)).toBe(true));
