import { readFileSync, writeFileSync } from 'node:fs';
import { total } from './core.js';

const settings = readFileSync('config/settings.yaml', 'utf8');
writeFileSync('lib/report.txt', `${total([settings.length])}\n`);
