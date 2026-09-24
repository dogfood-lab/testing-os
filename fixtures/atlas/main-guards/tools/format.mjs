import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function formatLines(lines) {
  return lines.map((line) => JSON.stringify(line)).join('\n');
}

const here = dirname(fileURLToPath(import.meta.url));
const invoked = process.argv[1]?.includes('format');
if (invoked) {
  writeFileSync(join(here, '..', 'data', 'sft.jsonl'), formatLines([{ a: 1 }]));
}
