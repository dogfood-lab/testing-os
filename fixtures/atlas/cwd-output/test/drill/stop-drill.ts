import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_BASE = join(process.cwd(), '.multi-claude', 'drill');

const attempt = join(OUTPUT_BASE, 'attempt-1');
mkdirSync(attempt, { recursive: true });
writeFileSync(join(attempt, 'prompt.md'), '# prompt\n');
for (const run of [1]) writeFileSync(join(OUTPUT_BASE, 'logs', `run-${run}.log`), `run ${run}\n`);
writeFileSync(join(OUTPUT_BASE, 'drill-report.json'), JSON.stringify({ drill: 'stop' }));
