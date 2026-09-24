import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { title } from './util.mjs';

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '..', 'out', 'report.md'), title('report'));
