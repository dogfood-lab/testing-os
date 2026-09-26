import { expect, test } from 'vitest';
import { wrap } from './wrap';

test('wraps', () => {
  expect(wrap('a')).toBe('[a]');
});
