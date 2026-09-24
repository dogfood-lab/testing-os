import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');
const EXAMPLES = resolve(ROOT, 'examples', 'assets');

function writeGlyph(filePath: string, json: string) {
  writeFileSync(filePath, json, 'utf-8');
}

// The slugs are the examples on disk, read at run time.
for (const slug of readdirSync(EXAMPLES)) {
  const dir = resolve(EXAMPLES, slug);
  mkdirSync(dir, { recursive: true });
  writeGlyph(resolve(dir, `${slug}.glyph`), '{}\n');
}
