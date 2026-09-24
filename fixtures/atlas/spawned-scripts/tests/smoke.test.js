import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const script = join(repoRoot, 'scripts', 'label.ts');
const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function runLabel(args) {
  execFileSync(process.execPath, [tsxCli, script, ...args], { cwd: repoRoot, encoding: 'utf-8' });
}

runLabel(['--help']);
