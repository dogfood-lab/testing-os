import { readFileSync } from 'node:fs';

const html = readFileSync('site/index.html', 'utf8');
console.log(html.length);
