import { readFileSync } from 'node:fs';

JSON.parse(readFileSync('package.json', 'utf8'));
