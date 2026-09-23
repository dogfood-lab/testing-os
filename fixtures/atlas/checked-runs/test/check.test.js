import { test } from 'node:test';
import { check } from '../lib/check.js';

test('check accepts true', () => {
  if (!check(true)) throw new Error('check');
});
