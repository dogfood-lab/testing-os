import { writeFileSync } from 'node:fs';

writeFileSync(new URL('./pirate-receipt.json', import.meta.url), '{}\n');
