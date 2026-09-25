import { writeFileSync } from 'node:fs';

writeFileSync('data/stats.json', JSON.stringify({ fetchedAt: new Date().toISOString() }));
