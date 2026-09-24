import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const { name, file } of [{ name: 'presets', file: 'presets.json' }, { name: 'nodes', file: 'nodes.json' }]) {
  writeFileSync(join(outDir, file), JSON.stringify({ name }));
}
