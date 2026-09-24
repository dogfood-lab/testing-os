import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const lang of ['ja', 'fr']) {
  writeFileSync(join(here, '..', 'docs', `README.${lang}.md`), `# ${lang}\n`);
}
