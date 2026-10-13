import { gate } from '../src/gate.mjs';

if (gate(-1)) {
  console.error('gate accepted a negative number');
  process.exitCode = 1;
}
