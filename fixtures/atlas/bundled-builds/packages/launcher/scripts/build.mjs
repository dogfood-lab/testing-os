import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const launcher = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function placeOf(out) {
  const pkg = out ? path.resolve(out) : launcher;
  return { pkg, dist: path.join(pkg, 'dist') };
}

export async function pack(out) {
  const { pkg, dist } = placeOf(out);
  await build({
    entryPoints: [path.join(pkg, 'src', 'cli.ts')],
    bundle: true,
    platform: 'node',
    outfile: path.join(dist, 'cli.js'),
  });
}

await pack(process.argv[2]);
