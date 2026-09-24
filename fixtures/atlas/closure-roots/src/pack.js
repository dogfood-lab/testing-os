import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exportTo } from './export.js';
import { parseFlags } from './flags.js';
import { stamp } from './stamp.js';

async function main() {
  const { positionals } = parseFlags(process.argv.slice(2));
  const [outDir, name] = positionals;
  const presetDir = resolve(outDir);
  await mkdir(join(presetDir, 'assets'), { recursive: true });
  const writeAsset = async (relPath, data) => {
    await writeFile(join(presetDir, relPath), data);
  };
  await writeAsset(`assets/${name}.f32`, new Uint8Array(4));
  await writeFile(join(presetDir, 'preset.json'), '{}');
  exportTo(process.argv[3]);
  stamp();
}

main();
