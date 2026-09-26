import { strictEqual } from 'node:assert';
import { clamp } from '../../src/clamp';

it('keeps a value in range', () => {
  strictEqual(clamp(2, 0, 3), 2);
});
