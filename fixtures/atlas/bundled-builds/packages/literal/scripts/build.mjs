import { buildSync } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

buildSync({
  entryPoints: [join(here, '..', 'src', 'main.ts')],
  bundle: true,
  outfile: join(here, '..', 'dist', 'main.js'),
});
