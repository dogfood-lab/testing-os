import { writeFileSync } from 'node:fs';

const target = process.argv[2];
writeFileSync(target, 'prepared\n');
