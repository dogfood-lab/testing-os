import { gate } from '../src/gate.mjs';

if (!gate(2)) process.exitCode = 1;
