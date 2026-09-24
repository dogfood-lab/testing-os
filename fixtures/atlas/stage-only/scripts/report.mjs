import { writeFileSync } from 'node:fs';

const at = process.argv.indexOf('--out');
writeFileSync(process.argv[at + 1], '# Report\n');
