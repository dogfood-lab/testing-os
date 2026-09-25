import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const home = homedir() || '.';
mkdirSync(join(home, '.state'), { recursive: true });
const name = process.env.RUN_NAME ?? 'run';
writeFileSync(`E:/scratch/${name}.json`, '{}');
