import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { schema } from '../lib/schema.js';

const latest = readFileSync(join('indexes', 'latest.json'), 'utf8');
writeFileSync('reports/out.md', `${schema.name}: ${latest}\n`);
