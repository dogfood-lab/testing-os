import { writeFileSync } from 'node:fs';

writeFileSync(new URL('./replay-receipt.json', import.meta.url), '{}\n');
