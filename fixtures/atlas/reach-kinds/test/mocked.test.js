import { expect, test, vi } from 'vitest';
import { mocked } from '../src/mocked.js';

vi.mock('../src/mocked.js', () => ({ mocked: () => 'stand-in' }));

test('mocked', () => {
  expect(mocked()).toBe('stand-in');
});
