import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');
const EXAMPLES = resolve(ROOT, 'examples', 'assets');

function writeGlyph(filePath: string, json: string) {
  writeFileSync(filePath, json, 'utf-8');
}

for (const slug of ['one']) {
  const dir = resolve(EXAMPLES, slug);
  mkdirSync(dir, { recursive: true });
  writeGlyph(resolve(dir, `${slug}.glyph`), '{}\n');
}
