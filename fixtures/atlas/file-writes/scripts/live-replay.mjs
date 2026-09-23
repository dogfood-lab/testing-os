import { writeFileSync } from 'node:fs';

// The receipt is written at run time and is not tracked.
writeFileSync(new URL('./live-replay-receipt.json', import.meta.url), '{}\n');
