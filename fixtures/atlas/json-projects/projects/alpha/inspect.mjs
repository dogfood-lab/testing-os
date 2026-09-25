import { readFileSync } from 'node:fs';

console.log(readFileSync('projects/alpha/project.json', 'utf8'));
