import { writeFileSync } from 'node:fs';

// Run by the catalog workflow from the repository root, so this is data/ here.
writeFileSync('data/catalog.json', '{"entries": []}\n');
