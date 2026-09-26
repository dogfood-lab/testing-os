import { expect, test } from 'vitest';
import { b } from './b';

test('b', () => {
  expect(b()).toBe('b');
});
