import { expect, test } from 'vitest';
import { parse } from '../src/parse';

test('parse', () => {
  expect(() => parse('nope')).toThrow('not a list');
});
