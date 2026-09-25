import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundlesDir = join(root, 'bundles');

for (const rule of readdirSync(join(bundlesDir, 'rules'))) {
  const id = rule.replace(/\.yaml$/, '');
  writeFileSync(join(bundlesDir, `${id}.json`), '{}\n');
}
