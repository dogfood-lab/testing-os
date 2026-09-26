import { expect, test } from 'vitest';
import { core } from '../src/core';

test('core', () => {
  expect(core([1, Number.NaN])).toEqual([1]);
});
