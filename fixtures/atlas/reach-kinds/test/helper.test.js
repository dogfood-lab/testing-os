import { expect, test } from 'vitest';
import { helper } from '../src/helper.js';

test('helper', () => {
  expect(helper()).toBe('deep');
});
