import { writeFileSync } from 'node:fs';

writeFileSync('data/report.json', `${JSON.stringify({ ok: true })}\n`);
