import { expect, it } from 'vitest';
import { main } from '../src/cli.js';

it('prints usage', () => {
  expect(main(['--help'])).toMatch(/usage/);
});
