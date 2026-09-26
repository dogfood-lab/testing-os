import { expect, it } from 'vitest';
import { sum } from '../../src/sum';

it('sums the real corpus', () => {
  expect(sum([])).toBe(0);
});
