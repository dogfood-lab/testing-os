import { expect, test } from 'vitest';
import { direct } from '../src/direct.js';

test('direct', () => {
  expect(direct()).toBe('direct');
});
