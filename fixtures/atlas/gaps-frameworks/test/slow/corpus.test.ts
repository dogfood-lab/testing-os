import { expect, it } from 'vitest';
import { sum } from '../../lib/sum.js';

it('sums the corpus', () => {
  expect(sum([3])).toBe(3);
});
