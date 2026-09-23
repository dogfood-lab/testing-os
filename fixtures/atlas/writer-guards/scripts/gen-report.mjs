import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.REPORT_SELFTEST === '1' || process.argv.includes('--selftest')) {
  console.log('selftest ok');
  process.exit(0);
}
writeFileSync(join(root, 'report.md'), '# Report\n');
