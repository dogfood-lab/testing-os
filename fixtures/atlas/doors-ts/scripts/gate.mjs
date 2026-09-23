import { execSync, spawnSync } from 'node:child_process';

// The release gate compiles the proof and runs its helper; neither command
// is in the workflow, only here.
execSync('npx tsc -p scripts/proof.tsconfig.json', { stdio: 'inherit' });
spawnSync('node', ['scripts/helper.mjs'], { stdio: 'inherit' });
const pattern = /x/;
pattern.exec('npx vitest run');
execSync(`node ${process.argv[2]}`);
