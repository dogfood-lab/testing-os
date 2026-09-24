import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

writeFileSync(join('logos', `${Date.now()}.svg`), '<svg/>\n');
