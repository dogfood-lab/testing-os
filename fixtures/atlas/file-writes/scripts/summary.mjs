import { writeFileSync } from 'node:fs';

writeFileSync(new URL('./notes/summary.txt', import.meta.url).pathname, 'summary\n');
