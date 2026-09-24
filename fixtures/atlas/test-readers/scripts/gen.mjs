import { writeFileSync } from 'node:fs';

writeFileSync('fixtures/golden.json', '{"loss":0.25}\n');
writeFileSync('fixtures/other.json', '{}\n');
