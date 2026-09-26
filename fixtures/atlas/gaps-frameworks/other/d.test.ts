import { expect, it } from 'vitest';
import { sum } from '../lib/sum.js';

it('sums one', () => {
  expect(sum([1])).toBe(1);
});
