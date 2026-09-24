import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'icons', '32x32.png'), 'png');
writeFileSync(join(here, 'icons', 'icon.ico'), 'ico');
