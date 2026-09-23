import { readFileSync, writeFileSync } from 'node:fs';

const nodes = JSON.parse(readFileSync('registry/nodes.json', 'utf8'));
writeFileSync('registry/metrics.json', JSON.stringify({ nodes: nodes.nodes.length }));
