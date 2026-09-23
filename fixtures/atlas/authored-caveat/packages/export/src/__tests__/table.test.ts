import fs from 'node:fs';
import path from 'node:path';
import { rows } from '../index.ts';

// The table is a committed file; this test rewrites it byte for byte.
const outDir = path.resolve(import.meta.dirname, '../../../../docs/alignment');
fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify({ rows }, null, 2)}\n`);
