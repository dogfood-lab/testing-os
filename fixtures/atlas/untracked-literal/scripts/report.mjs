import { mkdirSync, writeFileSync } from 'node:fs';

const name = process.env.REPORT_NAME ?? 'summary';
mkdirSync('reports', { recursive: true });
writeFileSync(`reports/${name}.json`, JSON.stringify({ ok: true }));
