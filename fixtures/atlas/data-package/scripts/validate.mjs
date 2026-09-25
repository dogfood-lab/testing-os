import { readFileSync } from 'node:fs';

JSON.parse(readFileSync('data/registry.json', 'utf8'));
