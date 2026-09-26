import { expect, test } from 'vitest';
import { core } from '../src/core';

test('flow', () => {
  expect(core([2])).toEqual([2]);
});
