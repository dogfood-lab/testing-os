import test from 'ava';
import { sum } from '../lib/sum.js';

test('sums', (t) => {
  t.is(sum([1, 1]), 2);
});
