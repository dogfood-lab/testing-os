import { writeFileSync } from 'node:fs';
import { settle } from '../src/index.js';

writeFileSync(new URL('./a-receipt.json', import.meta.url), JSON.stringify({ settled: settle() }));
