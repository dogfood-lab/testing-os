import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'runs', String(process.pid));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${Date.now()}.json`), '{}\n');
