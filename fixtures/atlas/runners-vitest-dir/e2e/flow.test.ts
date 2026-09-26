import { expect, test } from 'vitest';
import { wrap } from '../src/wrap';

test('flows', () => {
  expect(wrap('b')).toBe('[b]');
});
