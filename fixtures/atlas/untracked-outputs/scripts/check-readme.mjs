import { readFileSync } from 'node:fs';

if (!readFileSync('README.md', 'utf8').includes('version:start')) process.exit(1);
