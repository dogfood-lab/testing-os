import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// The ledger's manifest is located, not imported: a dependency all the same.
const require = createRequire(import.meta.url);
JSON.parse(readFileSync(require.resolve('@probe/ledger/package.json'), 'utf8'));
JSON.parse(readFileSync('package.json', 'utf8'));
