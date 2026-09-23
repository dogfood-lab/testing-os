import { writeFileSync } from 'node:fs';

writeFileSync(new URL('./live-receipt.json', import.meta.url), '{}\n');
