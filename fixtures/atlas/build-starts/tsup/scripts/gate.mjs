import { readFileSync } from 'node:fs';

if (!readFileSync('package.json', 'utf8').includes('"main"')) process.exit(1);
