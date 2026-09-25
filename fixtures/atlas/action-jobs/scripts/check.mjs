import { readFileSync } from 'node:fs';

if (!readFileSync('docs/index.md', 'utf8').startsWith('#')) process.exit(1);
