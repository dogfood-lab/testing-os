import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const guide = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'src', 'content', 'docs', 'guide');
for (const name of process.argv.slice(2)) writeFileSync(join(guide, `${name}.md`), `# ${name}\n`);
