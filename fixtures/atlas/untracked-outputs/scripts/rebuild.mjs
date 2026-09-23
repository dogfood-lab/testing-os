import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The index names are only known at run time; making the directory is the
// one place this script says where they go.
const indexes = join(dirname(fileURLToPath(import.meta.url)), '..', 'indexes');
mkdirSync(indexes, { recursive: true });

function save(path, value) {
  writeFileSync(path, JSON.stringify(value));
}

for (const name of process.argv.slice(2)) save(`${indexes}/${name}`, {});
