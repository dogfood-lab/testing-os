import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/shapecli.mjs', import.meta.url));
const out = execFileSync(process.execPath, [BIN, 'package.json'], { encoding: 'utf8' });
if (!/\d+/.test(out)) throw new Error('shapecli printed no length');
