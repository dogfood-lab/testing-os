import { readFileSync } from 'node:fs';

const catalog = readFileSync('docs/catalog.yaml', 'utf8');
if (!catalog.includes('repos:')) process.exit(1);
