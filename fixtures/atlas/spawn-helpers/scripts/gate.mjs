import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sh } from './lib/sh.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tgz = process.argv[2];

function run(label, cmd, opts = {}) {
  process.stdout.write(`${label}... `);
  execSync(cmd, { cwd: opts.cwd || ROOT, stdio: 'inherit' });
}

run('lint', 'node scripts/lint.mjs');
run('unit', 'node --test test/');
run('smoke', `node ${join(ROOT, 'scripts', 'smoke.mjs')} ${tgz}`);
run('from the environment', process.env.GATE_EXTRA);
sh('node scripts/docs.mjs');
execSync(`node ${join(ROOT, 'scripts', 'direct.mjs')}`, { stdio: 'inherit' });
