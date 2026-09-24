import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

writeFileSync(join(process.cwd(), 'tmp', 'scratch.json'), '{}');
