import { writeFileSync } from 'node:fs';

// Run by hand. CI lints this file and never runs it, so what it writes is
// not something CI writes.
writeFileSync(new URL('./replay-receipt.json', import.meta.url), '{}\n');
