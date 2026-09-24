import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const name of ['StoreLogo.png', 'Square44x44Logo.png']) writeFileSync(join(here, 'Assets', name), 'png');
