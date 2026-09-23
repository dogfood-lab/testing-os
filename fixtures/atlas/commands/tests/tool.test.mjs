import { test } from 'node:test';
import { run } from '../lib/run.js';

test('run counts its arguments', () => {
  if (run(['a']) !== 1) throw new Error('run');
});
