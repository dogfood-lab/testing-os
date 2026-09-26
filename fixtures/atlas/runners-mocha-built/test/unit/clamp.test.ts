import { strictEqual } from 'node:assert';
import { clamp } from '../../src/clamp';

it('clamps', () => {
  strictEqual(clamp(5, 0, 3), 3);
});
