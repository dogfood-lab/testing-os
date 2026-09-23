import { writeFileSync } from 'node:fs';
import { check } from '../lib/check.js';

writeFileSync('reports/gate.json', JSON.stringify({ passed: check(true) }));
