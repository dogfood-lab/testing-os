import { expect, test } from 'vitest';
import { scale } from './scale';

test('scales', () => {
  expect(scale(2, 3)).toBe(6);
});
