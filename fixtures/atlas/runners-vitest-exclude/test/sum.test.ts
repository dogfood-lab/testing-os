import { expect, it } from 'vitest';
import { sum } from '../src/sum';

it('sums', () => {
  expect(sum([1, 2])).toBe(3);
});
