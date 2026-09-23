import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(join(root, 'src', 'generated', 'table.js'), 'export const table = [];\n');
writeFileSync(join(root, 'data', 'table.json'), '[]\n');
writeFileSync(join(root, 'data', 'badge.svg'), '<svg/>\n');
